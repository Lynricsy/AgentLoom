export type InputPreprocessorTransformType =
  | 'jmespath'
  | 'jsonata'
  | 'template'
  | 'script'

export interface InputPreprocessorConfig {
  transformType: InputPreprocessorTransformType
  expression: string
  outputFormat?: string
}

export interface InputPreprocessorNodeHandler {
  execute(
    input: string | Record<string, unknown>,
    config: InputPreprocessorConfig,
  ): Promise<{
    output: string | Record<string, unknown>
    outputFormat?: string
  }>
}
