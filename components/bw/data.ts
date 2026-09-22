import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { currentExchangeRate } from "@/lib/pricing";
import { publicSailings } from "@/lib/sailing-schedule";
import { telHref, whatsappLink, WHATSAPP_OPENER } from "@/lib/site-contact";

/**
 * WHAT THE PUBLIC SITE KNOWS ABOUT THE COMPANY, READ ONCE PER REQUEST.
 *
 * Every figure on the public pages comes out of the rows the rest of the system
 * runs on — CompanySetting, the China warehouse, the live exchange rate, the
 * sailing schedule. Nothing here is typed into a component, so changing a phone
 * number in settings changes the header, the footer and the contact page at
 * once, and a sailing moved by the office moves on the timetable.
 */
export const bwCompany = cache(async () => {
  const [company, china] = await Promise.all([
    prisma.companySetting.findUnique({ where: { id: "singleton" } }),
    prisma.warehouse.findFirst({
      where: { kind: "CHINA", active: true },
      orderBy: { createdAt: "asc" },
      select: { addressLocal: true, addressEnglish: true, phone: true, city: true },
    }),
  ]);
  return {
    name: company?.name ?? "BlueWave Cargo",
    legalName: company?.darEntity ?? null,
    tagline: company?.tagline ?? null,
    tin: company?.tin ?? null,
    phone: company?.phone ?? null,
    phoneHref: company?.phone ? telHref(company.phone) : null,
    altPhone: company?.altPhone ?? null,
    altPhoneHref: company?.altPhone ? telHref(company.altPhone) : null,
    email: company?.email ?? null,
    whatsapp: whatsappLink(company?.whatsapp, WHATSAPP_OPENER),
    instagram: company?.instagram ?? null,
    darAddress: company?.darAddress ?? null,
    chinaAddress: china?.addressLocal ?? company?.chinaAddress ?? null,
    chinaAddressEnglish: china?.addressEnglish ?? null,
    chinaPhone: china?.phone ?? null,
    chinaCity: china?.city ?? "Foshan",
  };
});

export type BwCompany = Awaited<ReturnType<typeof bwCompany>>;

/** Today's USD → TZS rate as Finance published it, or null when none is live. */
export const bwExchangeRate = cache(async () => {
  const row = await currentExchangeRate();
  return row ? { rate: row.rate.toString(), since: row.effectiveFrom } : null;
});

export const bwSailings = cache((count: number) => publicSailings({ count }));
