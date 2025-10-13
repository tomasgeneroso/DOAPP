declare module '@paypal/checkout-server-sdk' {
  export class core {
    static SandboxEnvironment: any;
    static LiveEnvironment: any;
    static PayPalHttpClient: any;
  }

  export namespace orders {
    class OrdersCreateRequest {
      requestBody(body: any): void;
    }
    class OrdersCaptureRequest {
      constructor(orderId: string);
    }
    class OrdersGetRequest {
      constructor(orderId: string);
    }
  }

  export namespace payments {
    class CapturesRefundRequest {
      constructor(captureId: string);
      requestBody(body: any): void;
    }
  }
}
