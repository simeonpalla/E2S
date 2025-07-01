// Configuration
const urls = {
  script: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSWvAEJC3CsO5rCtPFmXExDDDCNJZPUcPyMNGKpEzIs1G6uheASs8bgCpsMPcc4xut5sjmO83xBREdC/pub?gid=0&single=true&output=csv",
  editor: "https://docs.google.com/spreadsheets/d/e/2PACX-1vT8JpC1m9QQyuGAp50hCdGKMIZtS5AaXZQ1VAj_8S303Yrgb2Z7XitDbX_RIh09uE54kFzPvUj-Bscn/pub?gid=0&single=true&output=csv",
  launch: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ-AJQfEekGizuAtNo-Z28e3FPnGY8SDJjNJc3el9xDBq4UM5R4PQQVWCEbVU4R9JlLyEUk29MWuAKd/pub?gid=0&single=true&output=csv"
};

const geoJsonUrl = "data/ap_assembly.geojson";

let datasets = {};
let geojsonData;
let map;
let layerGroup;

// Load all data
Promise.all([
  d3.csv(urls.script, row => {
    if (!row.AC || row.AC.trim() === "") return null;
    return {
      AC: row.AC.trim().toUpperCase(),
      City: row["City/Town/Village"]?.trim() || "N/A",
      Name: row["Scriptwriter Name"]?.trim() || "N/A",
      Status: row.Status?.trim() || "N/A"
    };
  }).catch(err => { console.error("Script CSV failed:", err); return []; }),
  d3.csv(urls.editor, row => {
    if (!row.AC || row.AC.trim() === "") return null;
    return {
      AC: row.AC.trim().toUpperCase(),
      City: row["City/Town/Village"]?.trim() || "N/A",
      Name: row["Editor Name"]?.trim() || "N/A",
      Status: row.Status?.trim() || "N/A"
    };
  }).catch(err => { console.error("Editor CSV failed:", err); return []; }),
  d3.csv(urls.launch, row => {
    if (!row.AC || row.AC.trim() === "") return null;
    return {
      AC: row.AC.trim().toUpperCase(),
      City: row["City/Town/Village"]?.trim() || "N/A",
      Name: row["Launch PoC Name"]?.trim() || "N/A",
      Status: row.Status?.trim() || "N/A"
    };
  }).catch(err => { console.error("Launch CSV failed:", err); return []; }),
  d3.json(geoJsonUrl).catch(err => { console.error("GeoJSON failed:", err); return null; })
]).then(([scriptData, editorData, launchData, geoData]) => {
  datasets = {
    script: scriptData.filter(d => d && d.AC && d.Name !== "N/A"),
    editor: editorData.filter(d => d && d.AC && d.Name !== "N/A"),
    launch: launchData.filter(d => d && d.AC && d.Name !== "N/A")
  };
  geojsonData = geoData;
  console.log("Script Data:", datasets.script);
  console.log("Editor Data:", datasets.editor);
  console.log("Launch Data:", datasets.launch);
  console.log("GeoJSON assem_name values:", geoData?.features?.map(f => f.properties.assem_name?.toUpperCase()));
  if (!geoData) {
    alert("Failed to load GeoJSON. Check file path or console for details.");
    return;
  }
  initMap();
  updateDashboard("script");
}).catch(error => {
  console.error("Promise.all failed:", error);
});

// Initialize Leaflet map
function initMap() {
  map = L.map("map", { zoomControl: false }).setView([15.9, 80.9], 7);
  layerGroup = L.layerGroup().addTo(map);

  document.getElementById("teamSelector").addEventListener("change", e => {
    updateDashboard(e.target.value);
  });
}

// Update map and table
function updateDashboard(team) {
  layerGroup.clearLayers();
  const data = datasets[team] || [];
  
  // Count entries per AC
  const countMap = new Map();
  data.forEach(d => {
    const count = countMap.get(d.AC) || 0;
    countMap.set(d.AC, count + 1);
  });
  console.log(`Count map for ${team}:`, Array.from(countMap.entries()));

  // Create color scale based on max count
  const maxCount = Math.max(...Array.from(countMap.values()), 1); // Avoid division by zero
  const colorScale = d3.scaleSequential()
    .domain([0, maxCount])
    .interpolator(d3.interpolateGreens);

  L.geoJSON(geojsonData, {
    style: feature => {
      const acName = feature.properties.assem_name?.toUpperCase();
      const count = countMap.get(acName) || 0;
      return {
        fillColor: colorScale(count),
        weight: 2,
        opacity: 1,
        color: "#ffffff", // White border
        fillOpacity: 0.7,
        interactive: true
      };
    },
    onEachFeature: (feature, layer) => {
      const acName = feature.properties.assem_name?.toUpperCase();
      const record = data.find(d => d.AC === acName); // Find first matching record for tooltip
      const count = countMap.get(acName) || 0;
      let tooltipContent = `<strong>AC:</strong> ${acName || "N/A"}<br><strong>Entries:</strong> ${count}`;
      if (record) {
        tooltipContent += `<br><strong>City/Town/Village:</strong> ${record.City}`;
        tooltipContent += `<br><strong>Name:</strong> ${record.Name}`;
        tooltipContent += `<br><strong>Status:</strong> ${record.Status}`;
      } else {
        tooltipContent += "<br>No additional data available.";
        console.warn(`No data for assem_name: ${acName}. Available ACs:`, Array.from(countMap.keys()));
      }
      layer.bindTooltip(tooltipContent, { sticky: true, opacity: 0.9 });
      layer.on('mouseover', () => {
        layer.setStyle({ fillColor: d3.color(colorScale(count)).darker(1) }); // Darker shade on hover
        layer.openTooltip();
      });
      layer.on('mouseout', () => {
        layer.setStyle({ fillColor: colorScale(count) }); // Reset to original color
        layer.closeTooltip();
      });
    }
  }).addTo(layerGroup);

  buildTable(data, team);
}

// Build table
function buildTable(data, team) {
  const container = d3.select("#tableContainer").html("");
  const table = container.append("table");
  const thead = table.append("thead").append("tr");
  const tbody = table.append("tbody");

  thead.selectAll("th")
    .data(["AC", "City/Town/Village", "Name", "Status", "Entries"])
    .enter()
    .append("th")
    .text(d => d);

  const validRows = data.filter(row => row.AC && row.Name !== "N/A" && row.City !== "N/A" && row.Status !== "N/A");
  console.log(`Valid rows for ${team}:`, validRows);
  if (validRows.length === 0) {
    container.append("p").text(`No valid data available for ${team} team.`);
    return;
  }
  const countMap = new Map();
  validRows.forEach(d => {
    const count = countMap.get(d.AC) || 0;
    countMap.set(d.AC, count + 1);
  });
  validRows.forEach(row => {
    tbody.append("tr")
      .selectAll("td")
      .data(["AC", "City", "Name", "Status", "Entries"].map(key => 
        key === "Entries" ? (countMap.get(row.AC) || 0) : (row[key] || "N/A")))
      .enter()
      .append("td")
      .text(d => d);
  });
}