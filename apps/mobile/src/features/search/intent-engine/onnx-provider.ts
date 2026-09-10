import type { Tokenizer } from '@huggingface/tokenizers';
import type { InferenceSession, Tensor } from 'onnxruntime-react-native';
import type { SemanticEmbeddingProvider } from './types';

export interface EmbeddingResources {
  session: InferenceSession;
  tokenizer: Tokenizer;
  tensor(values: readonly number[]): Tensor;
}
/** One lazy session, one inference in flight, no prompt/embedding cache. */
export function createOnnxEmbeddingProvider(
  load: () => Promise<EmbeddingResources>,
): SemanticEmbeddingProvider {
  let resources: Promise<EmbeddingResources> | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  function initialize() {
    resources ??= load().catch((error: unknown) => {
      resources = undefined;
      throw error;
    });
    return resources;
  }
  function serial<T>(operation: () => Promise<T>): Promise<T> {
    const work = queue.then(operation, operation);
    queue = work.catch(() => undefined);
    return work;
  }
  const provider: SemanticEmbeddingProvider = {
    async initialize() {
      await serial(async () => {
        await initialize();
      });
    },
    async warmup() {
      await provider.embed('Find pictures');
    },
    embed(text) {
      return serial(async () => {
        const { session, tokenizer, tensor } = await initialize();
        const encoded = tokenizer.encode(text, {
          add_special_tokens: true,
          return_token_type_ids: true,
        });
        const ids =
          encoded.ids.length > 128
            ? [...encoded.ids.slice(0, 127), encoded.ids.at(-1)!]
            : encoded.ids;
        const feeds: Record<string, Tensor> = {
          input_ids: tensor(ids),
          attention_mask: tensor(ids.map(() => 1)),
        };
        if (session.inputNames.includes('token_type_ids'))
          feeds.token_type_ids = tensor(ids.map(() => 0));
        let output: InferenceSession.ReturnType | undefined;
        try {
          output = await session.run(feeds);
          const hidden = output.last_hidden_state;
          if (
            !hidden ||
            hidden.dims.length !== 3 ||
            hidden.dims[1] !== ids.length ||
            hidden.dims[2] !== 384
          )
            throw new Error('INCOMPATIBLE_EMBEDDING_MODEL');
          const vector = new Array<number>(384).fill(0);
          for (let token = 0; token < ids.length; token++)
            for (let dim = 0; dim < 384; dim++)
              vector[dim] =
                vector[dim]! +
                Number(hidden.data[token * 384 + dim]) / ids.length;
          const norm = Math.sqrt(
            vector.reduce((sum, value) => sum + value * value, 0),
          );
          if (!Number.isFinite(norm) || norm === 0)
            throw new Error('INVALID_EMBEDDING');
          return vector.map((value) => value / norm);
        } finally {
          Object.values(feeds).forEach((value) => value.dispose());
          if (output) Object.values(output).forEach((value) => value.dispose());
        }
      });
    },
    dispose() {
      return serial(async () => {
        const current = resources;
        resources = undefined;
        if (current) await (await current).session.release();
      });
    },
  };
  return provider;
}
