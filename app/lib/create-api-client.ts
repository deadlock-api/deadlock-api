import axios, { type AxiosInstance } from "axios";

export function createApiClient(timeout: number): AxiosInstance {
  return axios.create({
    timeout,
    headers: {
      Accept: "application/json",
    },
  });
}
