import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({});

const SCHEMA_MARKDOWN = `
- view billing_document_cancellations: (billingDocument, billingDocumentType, creationDate, creationTime, lastChangeDateTime, billingDocumentDate, billingDocumentIsCancelled, cancelledBillingDocument, totalNetAmount, transactionCurrency, companyCode, fiscalYear, accountingDocument, soldToParty)
- view billing_document_headers: (billingDocument, billingDocumentType, creationDate, creationTime, lastChangeDateTime, billingDocumentDate, billingDocumentIsCancelled, cancelledBillingDocument, totalNetAmount, transactionCurrency, companyCode, fiscalYear, accountingDocument, soldToParty)
- view billing_document_items: (billingDocument, billingDocumentItem, material, billingQuantity, billingQuantityUnit, netAmount, transactionCurrency, referenceSdDocument, referenceSdDocumentItem)
- view business_partner_addresses: (businessPartner, addressId, validityStartDate, validityEndDate, addressUuid, addressTimeZone, cityName, country, poBox, poBoxDeviatingCityName, poBoxDeviatingCountry, poBoxDeviatingRegion, poBoxIsWithoutNumber, poBoxLobbyName, poBoxPostalCode, postalCode, region, streetName, taxJurisdiction, transportZone)
- view business_partners: (businessPartner, customer, businessPartnerCategory, businessPartnerFullName, businessPartnerGrouping, businessPartnerName, correspondenceLanguage, createdByUser, creationDate, creationTime, firstName, formOfAddress, industry, lastChangeDate, lastName, organizationBpName1, organizationBpName2, businessPartnerIsBlocked, isMarkedForArchiving)
- view customer_company_assignments: (customer, companyCode, accountingClerk, accountingClerkFaxNumber, accountingClerkInternetAddress, accountingClerkPhoneNumber, alternativePayerAccount, paymentBlockingReason, paymentMethodsList, paymentTerms, reconciliationAccount, deletionIndicator, customerAccountGroup)
- view customer_sales_area_assignments: (customer, salesOrganization, distributionChannel, division, billingIsBlockedForCustomer, completeDeliveryIsDefined, creditControlArea, currency, customerPaymentTerms, deliveryPriority, incotermsClassification, incotermsLocation1, salesGroup, salesOffice, shippingCondition, slsUnlmtdOvrdelivIsAllwd, supplyingPlant, salesDistrict, exchangeRateType)
- view journal_entry_items_accounts_receivable: (companyCode, fiscalYear, accountingDocument, glAccount, referenceDocument, costCenter, profitCenter, transactionCurrency, amountInTransactionCurrency, companyCodeCurrency, amountInCompanyCodeCurrency, postingDate, documentDate, accountingDocumentType, accountingDocumentItem, assignmentReference, lastChangeDateTime, customer, financialAccountType, clearingDate, clearingAccountingDocument, clearingDocFiscalYear)
- view outbound_delivery_headers: (actualGoodsMovementDate, actualGoodsMovementTime, creationDate, creationTime, deliveryBlockReason, deliveryDocument, hdrGeneralIncompletionStatus, headerBillingBlockReason, lastChangeDate, overallGoodsMovementStatus, overallPickingStatus, overallProofOfDeliveryStatus, shippingPoint)
- view outbound_delivery_items: (actualDeliveryQuantity, batch, deliveryDocument, deliveryDocumentItem, deliveryQuantityUnit, itemBillingBlockReason, lastChangeDate, plant, referenceSdDocument, referenceSdDocumentItem, storageLocation)
- view payments_accounts_receivable: (companyCode, fiscalYear, accountingDocument, accountingDocumentItem, clearingDate, clearingAccountingDocument, clearingDocFiscalYear, amountInTransactionCurrency, transactionCurrency, amountInCompanyCodeCurrency, companyCodeCurrency, customer, invoiceReference, invoiceReferenceFiscalYear, salesDocument, salesDocumentItem, postingDate, documentDate, assignmentReference, glAccount, financialAccountType, profitCenter, costCenter)
- view plants: (plant, plantName, valuationArea, plantCustomer, plantSupplier, factoryCalendar, defaultPurchasingOrganization, salesOrganization, addressId, plantCategory, distributionChannel, division, language, isMarkedForArchiving)
- view product_descriptions: (product, language, productDescription)
- view product_plants: (product, plant, countryOfOrigin, regionOfOrigin, productionInvtryManagedLoc, availabilityCheckType, fiscalYearVariant, profitCenter, mrpType)
- view product_storage_locations: (product, plant, storageLocation, physicalInventoryBlockInd, dateOfLastPostedCntUnRstrcdStk)
- view products: (product, productType, crossPlantStatus, crossPlantStatusValidityDate, creationDate, createdByUser, lastChangeDate, lastChangeDateTime, isMarkedForDeletion, productOldId, grossWeight, weightUnit, netWeight, productGroup, baseUnit, division, industrySector)
- view sales_order_headers: (salesOrder, salesOrderType, salesOrganization, distributionChannel, organizationDivision, salesGroup, salesOffice, soldToParty, creationDate, createdByUser, lastChangeDateTime, totalNetAmount, overallDeliveryStatus, overallOrdReltdBillgStatus, overallSdDocReferenceStatus, transactionCurrency, pricingDate, requestedDeliveryDate, headerBillingBlockReason, deliveryBlockReason, incotermsClassification, incotermsLocation1, customerPaymentTerms, totalCreditCheckStatus)
- view sales_order_items: (salesOrder, salesOrderItem, salesOrderItemCategory, material, requestedQuantity, requestedQuantityUnit, transactionCurrency, netAmount, materialGroup, productionPlant, storageLocation, salesDocumentRjcnReason, itemBillingBlockReason)
- view sales_order_schedule_lines: (salesOrder, salesOrderItem, scheduleLine, confirmedDeliveryDate, orderQuantityUnit, confdOrderQtyByMatlAvailCheck)
`;

async function callLLM(prompt: string): Promise<{ text: string, rawPrompt: string, rawResponse: any }> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    const responseText = (response.text || '').trim();

    // Safely strip class methods and non-serializable properties
    let safeResponse = {};
    try {
      safeResponse = JSON.parse(JSON.stringify(response));
    } catch (e) {
      safeResponse = { text: responseText, note: "Response was not serializable." };
    }

    return { text: responseText, rawPrompt: prompt, rawResponse: safeResponse };
  } catch (err: any) {
    return { text: '', rawPrompt: prompt, rawResponse: { error: err.message || String(err) } };
  }
}

export async function generateSQL(question: string): Promise<{ sql: string, rawPrompt: string, rawResponse: any }> {
  const prompt = `
You are a DuckDB SQL expert. The database has these views:
${SCHEMA_MARKDOWN}

Write a single DuckDB-compatible SQL SELECT statement to answer:
"${question}"

Rules:
- Only use the views listed above.
- Return ONLY the SQL inside a markdown code block. No explanation.
- Use standard SQL JOINs only.
- If the question cannot be answered using the views listed above, or is unrelated to the Order-to-Cash domain, return exactly GUARDRAIL_REJECT instead of SQL.
`;

  let llmResult = await callLLM(prompt);
  let sqlRes = llmResult.text;

  if (!sqlRes || sqlRes.trim() === 'GUARDRAIL_REJECT') {
    return { sql: 'GUARDRAIL_REJECT', rawPrompt: prompt, rawResponse: llmResult.rawResponse };
  }

  // Extract SQL from markdown code block
  const match = sqlRes.match(/```(sql)?\n([\s\S]*?)```/);
  if (match && match[2]) {
    return { sql: match[2].trim(), rawPrompt: prompt, rawResponse: llmResult.rawResponse };
  }
  return { sql: sqlRes.replace(/```/g, '').trim(), rawPrompt: prompt, rawResponse: llmResult.rawResponse };
}

export async function generateAnswer(question: string, records: any[]): Promise<{ answer: string, rawPrompt: string, rawResponse: any }> {
  const prompt = `
The user asked: "${question}"
The SQL query returned these results (JSON array):
${JSON.stringify(records)}

Summarize the answer in plain English, grounded strictly in the data above.
If results are empty, say so clearly. Do not invent any information.
`;
  const llmResult = await callLLM(prompt);
  return { answer: llmResult.text, rawPrompt: prompt, rawResponse: llmResult.rawResponse };
}
