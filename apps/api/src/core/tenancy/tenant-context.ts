// Holds the tenant + user for the current request, established from the JWT by
// the guard. It is the ONLY source of tenant identity inside a request.
export interface RequestContext {
  tenantId: string;
  userId: string;
}
