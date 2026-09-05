import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { encryptField, maskAccountNumber } from '../../shared/crypto/field-encryption';
import { checkForDuplicateParty } from './duplicate-detection';

interface CreateSupplierInput {
  legalName: string; type?: 'COMPANY' | 'INDIVIDUAL'; tradingName?: string; companyNumber?: string;
  vatNumber?: string; email?: string; phone?: string; addressLine1?: string; addressLine2?: string;
  city?: string; postcode?: string; country?: string; notes?: string; paymentTerms?: number;
  bankAccountName?: string; bankSortCode?: string; bankAccountNumber?: string; confirmDuplicate?: boolean;
}

@Injectable()
export class SuppliersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  async create(tenantId: string, userId: string, b: CreateSupplierInput) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      await checkForDuplicateParty(tx, tenantId, b, b.confirmDuplicate);

      const party = await tx.party.create({
        data: {
          tenantId, type: b.type ?? 'COMPANY', legalName: b.legalName,
          tradingName: b.tradingName, companyNumber: b.companyNumber, vatNumber: b.vatNumber,
          email: b.email, phone: b.phone,
          addressLine1: b.addressLine1, addressLine2: b.addressLine2,
          city: b.city, postcode: b.postcode, country: b.country, notes: b.notes,
        },
      });

      const hasBankDetails = b.bankAccountName && b.bankSortCode && b.bankAccountNumber;
      const supplier = await tx.supplierRole.create({
        data: {
          tenantId, partyId: party.id, paymentTerms: b.paymentTerms,
          // SEC-DAT-03: application-level encryption, never plaintext at rest.
          bankAccountNameEnc: b.bankAccountName ? encryptField(b.bankAccountName) : undefined,
          bankSortCodeEnc: b.bankSortCode ? encryptField(b.bankSortCode) : undefined,
          bankAccountNumberEnc: b.bankAccountNumber ? encryptField(b.bankAccountNumber) : undefined,
          bankDetailsUpdatedAt: hasBankDetails ? new Date() : undefined,
        },
      });

      await this.audit.write(tx, {
        tenantId, userId, action: 'supplier.created',
        resourceType: 'Party', resourceId: party.id, after: { legalName: b.legalName },
      });

      return {
        id: party.id, legalName: party.legalName, supplierId: supplier.id,
        bankAccountMasked: b.bankAccountNumber ? maskAccountNumber(b.bankAccountNumber) : null,
      };
    });
  }

  async list(tenantId: string) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const parties = await tx.party.findMany({
        where: { supplier: { isNot: null } },
        include: { supplier: true },
      });
      // Bank details are never decrypted for a list view — only a masked
      // last-4 marker, exactly enough to confirm "yes, we have details on file".
      return parties.map((p) => ({
        ...p,
        supplier: p.supplier && {
          id: p.supplier.id,
          paymentTerms: p.supplier.paymentTerms,
          hasBankDetails: !!p.supplier.bankAccountNumberEnc,
          bankDetailsUpdatedAt: p.supplier.bankDetailsUpdatedAt,
        },
      }));
    });
  }

  // FR-PTY-014: "require re-authentication for a change to supplier bank
  // details and shall raise a high-severity audit and notification event."
  async updateBankDetails(
    tenantId: string,
    userId: string,
    supplierId: string,
    password: string,
    bank: { bankAccountName: string; bankSortCode: string; bankAccountNumber: string },
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException({ code: 'auth.invalid_credentials', message: 'Incorrect password.' });
    }

    return this.prisma.forTenant(tenantId, async (tx) => {
      const supplier = await tx.supplierRole.findUniqueOrThrow({ where: { id: supplierId }, include: { party: true } });
      if (supplier.tenantId !== tenantId) throw new ForbiddenException();

      const before = { bankAccountNumberMasked: supplier.bankAccountNumberEnc ? '[on file]' : null };
      const updated = await tx.supplierRole.update({
        where: { id: supplierId },
        data: {
          bankAccountNameEnc: encryptField(bank.bankAccountName),
          bankSortCodeEnc: encryptField(bank.bankSortCode),
          bankAccountNumberEnc: encryptField(bank.bankAccountNumber),
          bankDetailsUpdatedAt: new Date(),
        },
      });

      await this.audit.write(tx, {
        tenantId, userId, action: 'supplier.bank_details_changed',
        resourceType: 'SupplierRole', resourceId: supplierId,
        before, after: { bankAccountNumberMasked: maskAccountNumber(bank.bankAccountNumber) },
      });
      await this.notifications.send(
        tx, tenantId, userId, 'IN_APP',
        `Bank details changed for ${supplier.party.legalName}`,
        `Bank details for supplier "${supplier.party.legalName}" were updated. If this wasn't you, investigate immediately.`,
      );

      return {
        id: updated.id,
        bankAccountMasked: maskAccountNumber(bank.bankAccountNumber),
        bankDetailsUpdatedAt: updated.bankDetailsUpdatedAt,
      };
    });
  }
}
