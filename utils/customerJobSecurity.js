// What property owners see about safety & crew — never BVN, employee IDs, or private field tokens.

const PAID_VISIBLE = ["accepted", "in_progress", "completion_requested", "completed"];

const customerSecurityView = (service) => {
  const status = service.booking?.progress;
  const paid = service.booking?.paymentStatus === "paid";
  const crew = service.serviceProvider?.assignedEmployees || [];
  const checkIns = service.arrivalLog?.checkIns || [];
  const reports = service.completion?.fieldReports || [];

  const customerPhotos = reports
    .filter((r) => r.reportKind === "before" || r.reportKind === "after")
    .map((r) => ({
      kind: r.reportKind,
      at: r.createdAt,
      message: r.message || "",
      photos: r.photos || [],
    }));

  const showVisitor =
    paid && PAID_VISIBLE.includes(status) && Boolean(service.customerSecurity?.visitorCode);

  return {
    belongingsReminder: true,
    belongingsAcknowledged: Boolean(service.customerSecurity?.belongingsAcknowledged),
    limitedAccessAcknowledged: Boolean(service.customerSecurity?.limitedAccessAcknowledged),
    accessNotes: service.customerSecurity?.accessNotes || "",
    visitorCode: showVisitor ? service.customerSecurity.visitorCode : null,
    showVisitorCode: showVisitor,
    teamLeadName: PAID_VISIBLE.includes(status) ? service.serviceProvider?.providerName || null : null,
    teamLeadPhone: ["accepted", "in_progress", "completion_requested"].includes(status)
      ? service.serviceProvider?.providerPhone || null
      : null,
    teamAssignedAt: service.serviceProvider?.acceptedAt || service.serviceProvider?.assignedAt || null,
    arrivedAt: service.arrivalLog?.arrivedAt || null,
    crewCount: crew.length,
    presentCount: checkIns.length,
    lastCheckInAt: checkIns.length ? checkIns[checkIns.length - 1].checkedInAt : null,
    workStartedAt: service.serviceProvider?.startedAt || null,
    status,
    completionRequestedAt: service.completion?.requestedAt || null,
    completedAt: service.completion?.completedAt || null,
    customerPhotos,
    issueCount: (service.customerSecurity?.issueReports || []).length,
  };
};

const formatCustomerService = (service) => {
  const status = service.booking.progress;
  return {
    id: service._id,
    service_id: service.service_id,
    serviceName: service.serviceName,
    serviceType: service.serviceType,
    serviceCategory: service.serviceCategory,
    serviceRate: service.serviceRate,
    status,
    paymentStatus: service.booking.paymentStatus,
    paymentReference: service.booking.payment?.reference || null,
    paymentUrl: service.booking.paymentStatus === "pending" ? service.booking.payment?.authorization_url || null : null,
    progress:
      status === "in_progress" || status === "completion_requested"
        ? {
            startedAt: service.serviceProvider?.startedAt || null,
            expectedMinutes: service.booking.expectedMinutes,
          }
        : null,
    bookingDate: service.booking.bookingDate,
    bookingTime: service.booking.bookingTime,
    location: service.booking.location,
    area: service.booking.area,
    partnerName: service.serviceProvider?.providerName || null,
    partnerPhone: ["accepted", "in_progress", "completion_requested"].includes(status)
      ? service.serviceProvider?.providerPhone
      : null,
    ownerSecurity: customerSecurityView(service),
    createdAt: service.createdAt,
    updatedAt: service.updatedAt,
    ...(service.serviceType === "house_cleaning" && {
      roomsCount: service.serviceDetails?.cleaningDetails?.roomsCount || 0,
      package: service.serviceDetails?.cleaningDetails?.package,
      frequency: service.serviceDetails?.cleaningDetails?.frequency,
    }),
  };
};

module.exports = { customerSecurityView, formatCustomerService };
