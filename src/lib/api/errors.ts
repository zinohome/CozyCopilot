export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable: boolean = false,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
