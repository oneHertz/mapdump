import React, { useEffect, useState } from "react";
import * as L from "leaflet";
import "../utils/Leaflet.ImageTransform";

var backdropMaps = {
	osm: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
		attribution:
			'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="http://mapbox.com">Mapbox</a>',
		className: "wms256",
	}),
	"gmap-street": L.tileLayer("https://mt0.google.com/vt/x={x}&y={y}&z={z}", {
		attribution: "&copy; Google",
		className: "wms256",
	}),
	"gmap-hybrid": L.tileLayer(
		"https://mt0.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}",
		{
			attribution: "&copy; Google",
			className: "wms256",
		},
	),
	"gmap-terrain": L.tileLayer(
		"https://mt0.google.com/vt/lyrs=p&hl=en&x={x}&y={y}&z={z}",
		{
			attribution: "&copy; Google",
			className: "wms256",
		},
	),
	"topo-fi": L.tileLayer.wms("https://tiles.kartat.kapsi.fi/peruskartta", {
		attribution: "&copy; National Land Survey of Finland",
		className: "wms256",
		layers: "peruskartta",
	}),
	"mapant-ee": L.tileLayer(
		"https://tiles.routechoices.com/proxy/ee/{z}/{x}/{y}.webp",
		{
			attribution: "&copy; mapantee.gokartor.se and Estonian Land Board",
			className: "wms256",
		},
	),
	"mapant-fi": L.tileLayer(
		"https://www.mapant.fi/wmts/wmts_EPSG3857.php?z={z}&x={x}&y={y}",
		{
			attribution: "&copy; MapAnt.fi and National Land Survey of Finland",
			className: "wms256",
		},
	),
	"topo-no": L.tileLayer(
		"https://cache.kartverket.no/v1/wmts/1.0.0/toporaster/default/webmercator/{z}/{y}/{x}.png",
		{
			attribution: "",
			className: "wms256",
		},
	),
	"topo-uk": L.tileLayer(
		"https://tiles.routechoices.com/proxy/uk/{z}/{x}/{y}.webp",
		{
			attribution: "&copy; Ordnance Survey",
			className: "wms256",
			minZoom: 7,
			maxNativeZoom: 15,
			bounds: [
				[49.75, -9.01],
				[61.01, 2.01],
			],
		},
	),
	"mapant-no": L.tileLayer("https://mapant.no/osm-tiles/{z}/{x}/{y}.png", {
		attribution: "&copy; MapAnt.no",
		className: "wms256",
	}),
	"mapant-ch": L.tileLayer(
		"https://tiles.routechoices.com/proxy/ch/{z}/{x}/{y}.webp",
		{
			attribution: "&copy; MapAnt.ch",
			className: "wms256",
		},
	),
	"mapant-se": L.tileLayer(
		"https://tiles.routechoices.com/proxy/se/{z}/{x}/{y}.webp",
		{
			attribution: "&copy; gokartor.se",
			className: "wms256",
		},
	),
	"topo-fr": L.tileLayer(
		"https://data.geopf.fr/wmts?layer=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&style=normal&tilematrixset=PM&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fpng&tilematrix={z}&tilecol={x}&tilerow={y}",
		{
			attribution:
				'<a href="https://www.ign.fr/" target="_blank">&copy; IGN France</a>',
			className: "wms256",
		},
	),
	"mapant-es": L.tileLayer.wms("https://mapant.es/wms", {
		layers: "mapant.es",
		format: "image/png",
		version: "1.3.0",
		transparent: true,
		attribution: "&copy; MapAnt.es",
		className: "wms256",
	}),
	"topo-world": L.tileLayer("https://tile.opentopomap.org/{z}/{x}/{y}.png", {
		attribution: "&copy; OpenTopoMap (CC-BY-SA)",
		className: "wms256",
	}),
	"topo-world-alt": L.tileLayer(
		"https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
		{
			attribution: "&copy; ArcGIS Online",
			className: "wms256",
		},
	),
};

function cloneLayer(layer) {
  function cloneOptions(options) {
    var ret = {};
    for (var i in options) {
      var item = options[i];
      if (item && item.clone) {
        ret[i] = item.clone();
      } else if (item instanceof L.Layer) {
        ret[i] = cloneLayer(item);
      } else {
        ret[i] = item;
      }
    }
    return ret;
  }

  function cloneInnerLayers(layer) {
    var layers = [];
    layer.eachLayer(function (inner) {
      layers.push(cloneLayer(inner));
    });
    return layers;
  }
  var options = cloneOptions(layer.options);
  // Renderers
  if (layer instanceof L.SVG) {
    return L.svg(options);
  }
  if (layer instanceof L.Canvas) {
    return L.canvas(options);
  }
  // GoogleMutant GridLayer
  if (L.GridLayer.GoogleMutant && layer instanceof L.GridLayer.GoogleMutant) {
    var googleLayer = L.gridLayer.googleMutant(options);
    layer._GAPIPromise.then(function () {
      var subLayers = Object.keys(layer._subLayers);

      for (var i in subLayers) {
        googleLayer.addGoogleLayer(subLayers[i]);
      }
    });
    return googleLayer;
  }
  // Tile layers
  if (layer instanceof L.TileLayer.WMS) {
    return L.tileLayer.wms(layer._url, options);
  }
  if (layer instanceof L.TileLayer) {
    return L.tileLayer(layer._url, options);
  }
  if (layer instanceof L.ImageOverlay) {
    return L.imageOverlay(layer._url, layer._bounds, options);
  }
  // Marker layers
  if (layer instanceof L.Marker) {
    return L.marker(layer.getLatLng(), options);
  }
  if (layer instanceof L.Circle) {
    return L.circle(layer.getLatLng(), layer.getRadius(), options);
  }
  if (layer instanceof L.CircleMarker) {
    return L.circleMarker(layer.getLatLng(), options);
  }
  if (layer instanceof L.Rectangle) {
    return L.rectangle(layer.getBounds(), options);
  }
  if (layer instanceof L.Polygon) {
    return L.polygon(layer.getLatLngs(), options);
  }
  if (layer instanceof L.Polyline) {
    return L.polyline(layer.getLatLngs(), options);
  }
  if (layer instanceof L.GeoJSON) {
    return L.geoJson(layer.toGeoJSON(), options);
  }
  if (layer instanceof L.FeatureGroup) {
    return L.featureGroup(cloneInnerLayers(layer));
  }
  if (layer instanceof L.LayerGroup) {
    return L.layerGroup(cloneInnerLayers(layer));
  }
  throw Error(
    "Unknown layer, cannot clone this layer. Leaflet-version: " + L.version
  );
}


const backgroundMapTitles = {
	osm: "Open Street Map",
	"gmap-street": "Google Map Street",
	"gmap-hybrid": "Google Map Satellite",
	"gmap-terrain": "Google Map Terrain",
	"mapant-ee": "Mapant Estonia",
	"mapant-fi": "Mapant Finland",
	"mapant-no": "Mapant Norway",
	"mapant-es": "Mapant Spain",
	"mapant-se": "Mapant Sweden",
	"mapant-ch": "Mapant Switzerland",
	"topo-fi": "Topo Finland",
	"topo-fr": "Topo France",
	"topo-no": "Topo Norway",
	"topo-uk": "Topo UK",
	"topo-world": "Topo World (OpenTopo)",
	"topo-world-alt": "Topo World (ArcGIS)",
};

function getBaseLayers() {
	const entries = {};
	for (const [key, value] of Object.entries(backgroundMapTitles)) {
		entries[value] = cloneLayer(backdropMaps[key]);
	}
	return entries;
}

function round5(x) {
  return Math.round(x * 1e5) / 1e5;
}

function getCalibrationString(c) {
  var parts = [];
  for (var i = 0; i < c.length; i++) {
    parts.push(round5(c[i].lat) + "," + round5(c[i].lng));
  }
  return parts.join(",");
}

const CalibrationPreview = (props) => {
  const { onValue, route, imgDataURI, cornersCoordinates } = props;

  const [mapPreview, setMapPreview] = useState();

  useEffect(() => {
    const routeData = route || [];
    if (mapPreview) {
      mapPreview.off();
      mapPreview.remove();
      document.getElementById("mapPreview").innerHTML = "";
    }
    if (L.DomUtil.get('mapPreview')._leaflet_id) return;
    const tmpMapPreview = L.map("mapPreview", {
      zoomSnap: 0,
      scrollWheelZoom: true,
    }).fitBounds(cornersCoordinates);
    const transformedImage = L.ImageOverlay.imageTransform(imgDataURI, cornersCoordinates, {
      opacity: 0.7,
    });
    transformedImage.addTo(tmpMapPreview);
    const latlngs = routeData.map((pt) => pt.latlng.slice(0, 2));
    L.polyline(latlngs, { color: "red" }).addTo(tmpMapPreview);

    const baseLayers = getBaseLayers();
    const defaultLayer = baseLayers["Open Street Map"];

    tmpMapPreview.addLayer(defaultLayer);

    const controlLayers = new L.Control.Layers(baseLayers, {
      Map: transformedImage,
    });
    tmpMapPreview.addControl(controlLayers);
    if (L.Browser.touch && L.Browser.mobile) {
      tmpMapPreview.on("baselayerchange", function (e) {
        controlLayers.collapse();
      });
    }
    setMapPreview(tmpMapPreview);
    // eslint-disable-next-line
  }, []);

  return (
    <>
      <div>
        <div className="row">
          <div className="col-md-12">
            <div className="alert alert-info" role="alert">
              <span id="help_text">
                Check that your map is well aligned with the world map.
              </span>
            </div>
          </div>
        </div>
        <div className="row">
          <div className="col-md-12">
            <div id="mapPreview" className="leaflet_map"></div>
          </div>
        </div>
        <div className="row" style={{ marginTop: "10px" }}>
          <div className="col-md-12">
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                onValue(false);
              }}
            >
              <i className="fas fa-undo"></i> Back
            </button>
            &nbsp;
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onValue(getCalibrationString(cornersCoordinates))}
              data-testid="validate-button"
            >
              <i className="fas fa-arrow-alt-circle-right"></i> Validate
              Calibration
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default CalibrationPreview;
