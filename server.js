// Get all charging stations in Sweden using openchargemap API and send them to the front-end

const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const app = express();

app.use(cors());

app.get("/api/charging-stations", async (req, res) => {
  try {
    // Get bounds from query parameters
    const { north, south, east, west, maxResults = 500 } = req.query;
    
    let apiUrl = "https://api.openchargemap.io/v3/poi/?output=json&countrycode=SE";
    
    // If bounds are provided, add them to the API request
    if (north && south && east && west) {
      apiUrl += `&boundingbox=(${south},${west}),(${north},${east})`;
      apiUrl += `&maxresults=${maxResults}`;
    } else {
      // Fallback to all of Sweden if no bounds provided
      apiUrl += `&maxresults=${maxResults}`;
    }

    const response = await fetch(apiUrl, {
        headers: {
          "User-Agent": "Chargify/1.0 (x@email.com)",
          "X-API-Key": "3afa81c6-0da9-4e26-82eb-a9ce989a9c10",
        },
      }
    );
    if (!response.ok) {
      throw new Error(
        `Open Charge Map error: ${response.status} ${response.statusText}`
      );
    }
    const data = await response.json();

    const formatted = data.map((station) => ({
      id: station.ID,
      title: station.AddressInfo?.Title,
      address: station.AddressInfo?.AddressLine1,
      town: station.AddressInfo?.Town,
      state: station.AddressInfo?.StateOrProvince,
      postcode: station.AddressInfo?.Postcode,
      country: station.AddressInfo?.Country?.Title,
      latitude: station.AddressInfo?.Latitude,
      longitude: station.AddressInfo?.Longitude,
      relatedUrl: station.AddressInfo?.RelatedURL,
      distance: station.AddressInfo?.Distance,
      numberOfPoints: station.NumberOfPoints,
      usageType: station.UsageType?.Title,
      statusType: station.StatusType?.Title,
      operator: station.OperatorInfo?.Title,
      connections: station.Connections?.map((conn) => ({
        type: conn.ConnectionType?.Title,
        level: conn.Level?.Title,
        amps: conn.Amps,
        voltage: conn.Voltage,
        powerKW: conn.PowerKW,
        quantity: conn.Quantity,
        price: conn.Price,
        currentType: conn.CurrentType?.Title,
        status: conn.StatusType?.Title,
      })),
      generalComments: station.GeneralComments,
      dateLastVerified: station.DateLastVerified,
      dateCreated: station.DateCreated,
      dateLastStatusUpdate: station.DateLastStatusUpdate,
      submissionStatus: station.SubmissionStatus?.Title,
      mediaItems: station.MediaItems,
      // Add any other fields you need from the API response
    }));

    res.json(formatted);
  } catch (err) {
    console.error("Backend error:", err);
    res.status(500).json({
      error: "Failed to fetch charging stations",
      details: err.message,
    });
  }
});

app.listen(3001, () => {
  console.log("Backend running on http://localhost:3001");
});