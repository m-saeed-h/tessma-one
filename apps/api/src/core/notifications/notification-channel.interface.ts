export interface NotificationRequest {
  tenantId: string;
  userId: string;
  subject: string;
  body: string;
}

export interface NotificationChannelProvider {
  send(req: NotificationRequest): Promise<void>;
}
