/** Build-time only: pinned public assets and precomputed prototype vectors. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Tokenizer } from '@huggingface/tokenizers';
import * as ort from 'onnxruntime-node';
import { format } from 'prettier';
import { createOnnxEmbeddingProvider } from '../apps/mobile/src/features/search/intent-engine/onnx-provider';
import { prototypes } from '../apps/mobile/src/features/search/intent-engine/prototypes';

async function main() {
  const root = resolve(__dirname, '..');
  const directory = resolve(root, 'apps/mobile/assets/intent-model');
  await mkdir(directory, { recursive: true });
  const revision = '2c4055b12046f11709e9df2c122e59ffbdc2f900';
  const files = {
    'model.onnx': 'onnx/model_quantized.onnx',
    'tokenizer.tokenizer': 'tokenizer.json',
    'tokenizer_config.json': 'tokenizer_config.json',
  };
  const checksums: Record<string, string> = {};
  for (const [local, remote] of Object.entries(files)) {
    const path = resolve(directory, local);
    let bytes: Buffer;
    try {
      bytes = await readFile(path);
    } catch {
      const response = await fetch(
        `https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2/resolve/${revision}/${remote}`,
      );
      if (!response.ok)
        throw new Error(`Model download failed: ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
      await writeFile(path, bytes);
    }
    checksums[local] = createHash('sha256').update(bytes).digest('hex');
  }
  const manifestPath = resolve(directory, 'manifest.json');
  try {
    const saved = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      checksums: Record<string, string>;
    };
    for (const [name, checksum] of Object.entries(checksums))
      if (saved.checksums[name] !== checksum)
        throw new Error(`MODEL_CHECKSUM_MISMATCH: ${name}`);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
      throw error;
  }
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        model: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
        revision,
        dimensions: 384,
        maxTokens: 128,
        pooling: 'mean-normalized',
        checksums,
      },
      null,
      2,
    ) + '\n',
  );
  const provider = createOnnxEmbeddingProvider(async () => ({
    session: await ort.InferenceSession.create(
      resolve(directory, 'model.onnx'),
      { executionProviders: ['cpu'], intraOpNumThreads: 2 },
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
  try {
    const vectors = [];
    for (const prototype of prototypes)
      for (const text of prototype.texts)
        vectors.push({
          concept: prototype.concept,
          vector: await provider.embed(text),
        });
    await writeFile(
      resolve(
        root,
        'apps/mobile/src/features/search/intent-engine/prototype-vectors.json',
      ),
      await format(JSON.stringify(vectors), { parser: 'json' }),
    );
  } finally {
    await provider.dispose();
  }
}
void main();
