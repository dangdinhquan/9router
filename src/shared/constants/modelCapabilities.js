export const MODEL_CAPABILITY_META = {
  text: { icon: "subject", label: "Text" },
  vision: { icon: "visibility", label: "Vision" },
  tools: { icon: "build", label: "Tools" },
  function_calling: { icon: "link", label: "Function Calling" },
  reasoning: { icon: "psychology", label: "Reasoning" },
  code: { icon: "code", label: "Code" },
  audio_input: { icon: "mic", label: "Audio Input" },
  audio_output: { icon: "speaker", label: "Audio Output" },
  image_input: { icon: "image", label: "Image Input" },
  image_output: { icon: "imagesmode", label: "Image Output" },
  json_mode: { icon: "data_object", label: "JSON Mode" },
  streaming: { icon: "air", label: "Streaming" },
};

export const KNOWN_MODEL_CAPABILITIES = Object.keys(MODEL_CAPABILITY_META);
