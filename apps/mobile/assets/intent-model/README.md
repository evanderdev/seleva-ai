# Intent model assets

`pnpm intent:model` downloads the pinned quantized ONNX model and tokenizer, verifies their
checksums against `manifest.json`, and regenerates the committed prototype vectors.

The binary assets are ignored by Git because they total about 135 MB. Run the command before a
Development Build. The mobile app never downloads a model or sends a user prompt over the network.

Model: `Xenova/paraphrase-multilingual-MiniLM-L12-v2`, revision recorded in `manifest.json`.
Upstream model: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` (Apache-2.0).
