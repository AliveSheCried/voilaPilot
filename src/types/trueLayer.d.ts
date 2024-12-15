export interface TrueLayerTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface TrueLayerError {
  error: string;
  error_description?: string;
  status_code: number;
} 