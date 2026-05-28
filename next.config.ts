import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @xenova/transformers e chromadb usano binding nativi (onnxruntime-node, sharp):
  // vanno tenuti come external nel server bundle altrimenti il bundler webpack li rompe.
  serverExternalPackages: ["@xenova/transformers", "onnxruntime-node", "sharp", "chromadb"],
};

export default nextConfig;
