import { createIntentEngine } from './engine';
import { createOnnxEmbeddingProvider } from './onnx-provider';
import { createSemanticMatcher, type PrototypeVector } from './semantic';
import prototypeVectors from './prototype-vectors.json';
import { NativeModules } from 'react-native';

type OnnxRuntimeModule = {
  install?: unknown;
};

/**
 * ONNX Runtime for React Native still exposes its native bridge module under
 * `NativeModules`. Development builds using a different native runtime may not
 * include that bridge, so semantic intent matching must remain optional.
 */
export function isOnnxRuntimeAvailable(): boolean {
  const onnxModule = (NativeModules as {
    Onnxruntime?: OnnxRuntimeModule;
  }).Onnxruntime;
  return Boolean(onnxModule && typeof onnxModule.install === 'function');
}

const provider = createOnnxEmbeddingProvider(async () => {
  if (!isOnnxRuntimeAvailable()) throw new Error('ONNX_RUNTIME_UNAVAILABLE');
  const [{ Asset }, { File }, { Tokenizer }, ort] = await Promise.all([
    import('expo-asset'),
    import('expo-file-system'),
    import('@huggingface/tokenizers'),
    import('onnxruntime-react-native'),
  ]);
  const [model, vocabulary] = await Asset.loadAsync([
    // Metro requires literal CommonJS references for bundled binary assets.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../../../assets/intent-model/model.onnx'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../../../assets/intent-model/tokenizer.tokenizer'),
  ]);
  if (!model?.localUri || !vocabulary?.localUri)
    throw new Error('MODEL_UNAVAILABLE');
  const tokenizer = new Tokenizer(
    JSON.parse(await new File(vocabulary.localUri).text()) as object,
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../../../assets/intent-model/tokenizer_config.json') as object,
  );
  const session = await ort.InferenceSession.create(
    model.localUri.replace(/^file:\/\//, ''),
    {
      executionProviders: ['cpu'],
      intraOpNumThreads: 2,
      interOpNumThreads: 1,
    },
  );
  return {
    session,
    tokenizer,
    tensor: (values: readonly number[]) =>
      new ort.Tensor('int64', BigInt64Array.from(values, BigInt), [
        1,
        values.length,
      ]),
  };
});

let vectors: PrototypeVector[] | undefined;
const semantic = {
  async match(text: string) {
    vectors ??= prototypeVectors as PrototypeVector[];
    return createSemanticMatcher(provider, vectors).match(text);
  },
  dispose: () => provider.dispose(),
};
export const mobileIntentEngine = createIntentEngine({ semantic });
