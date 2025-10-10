// Facebook SDK Type Declarations
interface FBLoginStatus {
  status: 'connected' | 'not_authorized' | 'unknown';
  authResponse?: {
    accessToken: string;
    expiresIn: number;
    signedRequest: string;
    userID: string;
  };
}

interface FBLoginOptions {
  scope?: string;
  return_scopes?: boolean;
  auth_type?: string;
}

interface FB {
  init(params: {
    appId: string;
    cookie?: boolean;
    xfbml?: boolean;
    version: string;
  }): void;

  login(
    callback: (response: FBLoginStatus) => void,
    options?: FBLoginOptions
  ): void;

  logout(callback: (response: FBLoginStatus) => void): void;

  getLoginStatus(callback: (response: FBLoginStatus) => void): void;

  api(
    path: string,
    method: string,
    params: any,
    callback: (response: any) => void
  ): void;

  api(path: string, params: any, callback: (response: any) => void): void;

  api(path: string, callback: (response: any) => void): void;

  AppEvents: {
    logPageView(): void;
  };
}

interface Window {
  FB: FB;
  fbAsyncInit: () => void;
}

declare const FB: FB;
