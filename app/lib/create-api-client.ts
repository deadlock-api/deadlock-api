import axios, { type AxiosInstance } from "axios";

export function createApiClient(timeout: number): AxiosInstance {
  return axios.create({
    timeout,
    headers: {
      Accept: "application/json",
      "User-Agent": "DeadlockAPI/1.0.0",
    },
  });
}
