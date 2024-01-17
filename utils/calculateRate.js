const calculateServiceRate = (selectedAreas) => {
    // Simple example: Assume a base rate per area, adjust as needed
    const baseRatePerArea = 4500; // Adjust this value based on your pricing strategy
    const numberOfAreas = selectedAreas.length;
    const transport = 2000
    // Calculate the total service rate
    const serviceRate = baseRatePerArea * numberOfAreas + transport;
  
    return serviceRate;
  };
  

  module.exports = calculateServiceRate