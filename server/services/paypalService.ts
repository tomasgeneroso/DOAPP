// PayPal service stub — not yet implemented
const paypalService = {
  calculatePlatformFee: (_amount: number) => 0,
  createOrder: async (_opts: any) => null,
  captureOrder: async (_orderId: string) => null,
  refundPayment: async (_captureId: string, _amount: string, _currency: string) => null,
};

export default paypalService;
