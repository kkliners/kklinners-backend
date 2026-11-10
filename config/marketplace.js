// ============================================================
// KLINER MARKETPLACE SETTINGS
// Launch district + commission. The frontend keeps a copy of the
// area list at Kliner-Web-App/utils/serviceAreas.js — keep them in sync.
// ============================================================

const LAUNCH_DISTRICT = "Gbagada";

// Neighbourhoods we accept bookings from (Gbagada, Kosofe LGA, Lagos).
// Add/remove here as partner coverage changes.
const SERVICE_AREAS = [
  "Gbagada Phase 1",
  "Gbagada Phase 2",
  "Gbagada Estate",
  "Ifako-Gbagada",
  "Soluyi",
  "Atunrase Estate",
  "Medina Estate",
  "Millennium/UPS Estate",
  "New Garage",
  "Pedro",
  "Charley Boy",
];

// Kliner keeps this share of every completed job; the partner gets the rest.
const COMMISSION_RATE = 0.15;

// Checks that must be ticked before a partner can be verified.
// CAC is NOT required — most small cleaning companies aren't registered.
const REQUIRED_VERIFICATION_CHECKS = [
  "idSeen",
  "bankNameMatches",
  "guarantorCalled",
  "officeVisited",
];

const isServiceArea = (area) => SERVICE_AREAS.includes(area);

module.exports = {
  LAUNCH_DISTRICT,
  SERVICE_AREAS,
  COMMISSION_RATE,
  REQUIRED_VERIFICATION_CHECKS,
  isServiceArea,
};
