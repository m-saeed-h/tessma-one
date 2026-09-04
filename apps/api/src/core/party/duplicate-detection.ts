import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

interface DuplicateCheckInput {
  legalName: string;
  companyNumber?: string;
  vatNumber?: string;
  email?: string;
}

// FR-PTY-008: "detect probable duplicates on creation using name, company
// number, VAT number and email, and warn before saving." Implemented as a
// real two-step API contract, not a fire-and-forget warning: a match throws
// a 409 with the candidates, and the caller must resubmit with
// confirmDuplicate: true to actually create the record — the server never
// silently decides "close enough, proceed" on the caller's behalf.
export async function checkForDuplicateParty(
  tx: Prisma.TransactionClient,
  tenantId: string,
  input: DuplicateCheckInput,
  confirmDuplicate: boolean | undefined,
) {
  const candidates = await tx.party.findMany({
    where: {
      tenantId,
      OR: [
        { legalName: { equals: input.legalName, mode: 'insensitive' } },
        ...(input.companyNumber ? [{ companyNumber: input.companyNumber }] : []),
        ...(input.vatNumber ? [{ vatNumber: input.vatNumber }] : []),
        ...(input.email ? [{ email: input.email }] : []),
      ],
    },
    select: { id: true, legalName: true, companyNumber: true, vatNumber: true, email: true },
    take: 5,
  });

  if (candidates.length > 0 && !confirmDuplicate) {
    throw new ConflictException({
      code: 'party.possible_duplicate',
      message: 'A similar record already exists. Resubmit with confirmDuplicate: true to create it anyway.',
      details: { possibleDuplicates: candidates },
    });
  }
}
