import { type AxiosInstance, create } from "axios";

export function createApiClient(timeout: number): AxiosInstance {
  return create({
    timeout,
    headers: {
      Accept: "application/json",
    },
  });
}
