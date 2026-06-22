// Real Gaborone healthcare-facility names used for realistic mock data.
// NOT confirmed Cospharm clients. Swap out from this single file.

export const PHARMA_DISTRIBUTORS = [
  "Mediland Healthcare Distributors",
  "Medicore Enterprises",
  "Medswana",
  "Fine Pharmaceuticals",
  "Africure Pharmaceuticals Botswana",
];

export const HOSPITALS_AND_CLINICS = [
  "Princess Marina Hospital",
  "Sir Ketumile Masire Teaching Hospital",
  "Sidilega Private Hospital",
  "Lenmed Bokamoso Private Hospital",
  "Life Gaborone Private Hospital",
  "Gaborone Private Hospital",
  "Acacia Medicare Clinic",
  "Medplus Medical Centre",
];

export const ALL_CLIENTS = [...PHARMA_DISTRIBUTORS, ...HOSPITALS_AND_CLINICS];

export const CLIENT_CONTACTS: Record<string, string> = {
  "Princess Marina Hospital": "+267 36 553 22",
  "Sir Ketumile Masire Teaching Hospital": "+267 36 555 80",
  "Sidilega Private Hospital": "+267 36 363 00",
  "Lenmed Bokamoso Private Hospital": "+267 36 911 00",
  "Life Gaborone Private Hospital": "+267 36 350 00",
  "Gaborone Private Hospital": "+267 36 010 00",
  "Acacia Medicare Clinic": "+267 39 730 11",
  "Medplus Medical Centre": "+267 39 555 12",
  "Mediland Healthcare Distributors": "+267 39 110 22",
  "Medicore Enterprises": "+267 39 558 11",
  "Medswana": "+267 39 547 03",
  "Fine Pharmaceuticals": "+267 39 511 80",
  "Africure Pharmaceuticals Botswana": "+267 39 802 90",
};