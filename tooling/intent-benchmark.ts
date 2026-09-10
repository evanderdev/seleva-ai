import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Tokenizer } from '@huggingface/tokenizers';
import * as ort from 'onnxruntime-node';
import { createOnnxEmbeddingProvider } from '../apps/mobile/src/features/search/intent-engine/onnx-provider';
import {
  cosineSimilarity,
  createSemanticMatcher,
} from '../apps/mobile/src/features/search/intent-engine/semantic';

async function main() {
  const root = resolve(__dirname, '..');
  const directory = resolve(root, 'apps/mobile/assets/intent-model');
  const vectors = JSON.parse(
    await readFile(
      resolve(
        root,
        'apps/mobile/src/features/search/intent-engine/prototype-vectors.json',
      ),
      'utf8',
    ),
  ) as Array<{ concept: string; vector: number[] }>;
  const provider = createOnnxEmbeddingProvider(async () => ({
    session: await ort.InferenceSession.create(
      resolve(directory, 'model.onnx'),
      {
        executionProviders: ['cpu'],
        intraOpNumThreads: 2,
      },
    ),
    tokenizer: new Tokenizer(
      JSON.parse(
        await readFile(resolve(directory, 'tokenizer.tokenizer'), 'utf8'),
      ) as object,
      JSON.parse(
        await readFile(resolve(directory, 'tokenizer_config.json'), 'utf8'),
      ) as object,
    ),
    tensor: (values) =>
      new ort.Tensor('int64', BigInt64Array.from(values, BigInt), [
        1,
        values.length,
      ]),
  }));
  const matcher = createSemanticMatcher(provider, vectors);
  const cases = [
    ['my phone is full, show me junk I will not miss', 'free_space'],
    ['tem várias fotos quase iguais e queria deixar só uma boa', 'best_shot'],
    ['acho que salvei telas da encomenda que já chegou', 'delivery_tracking'],
    ['hay demasiadas copias de la misma imagen', 'duplicate'],
  ] as const;
  try {
    for (const [text, expected] of cases) {
      const started = performance.now();
      const embedding = await provider.embed(text);
      const scores = Object.entries(
        Object.groupBy(vectors, (vector) => vector.concept),
      )
        .map(([concept, samples]) => ({
          concept,
          similarity: Math.max(
            ...(samples ?? []).map((sample) =>
              cosineSimilarity(embedding, sample.vector),
            ),
          ),
        }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5);
      const matches = await matcher.match(text);
      const concepts = matches.map((match) => match.concept);
      console.log(
        JSON.stringify({
          expected,
          concepts,
          scores,
          durationMs: Math.round(performance.now() - started),
        }),
      );
      if (!concepts.includes(expected)) process.exitCode = 1;
    }
  } finally {
    await matcher.dispose();
  }
}
void main();
