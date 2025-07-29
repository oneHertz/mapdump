import React, { useEffect, useState, useRef } from "react";
import * as L from "leaflet";
import CalibrationPreview from "./CalibrationPreview";
import "../utils/Leaflet.ImageTransform";
import {
  general2DProjection,
  SpheroidProjection,
  project,
  Point,
  resetOrientation,
} from "../utils";

const iconScale = L.Browser.mobile ? 2 : 1;

const colorIcon = (color) => {
  return new L.Icon({
    iconUrl:
      "/static/vendor/leaflet-color-markers-1.0.0/img/marker-icon-2x-" +
      color +
      ".png",
    shadowUrl: "/static/vendor/leaflet-1.9.4/images/marker-shadow.png",
    iconSize: [25 * iconScale, 41 * iconScale],
    iconAnchor: [12 * iconScale, 41 * iconScale],
    popupAnchor: [1 * iconScale, -34 * iconScale],
    shadowSize: [41 * iconScale, 41 * iconScale],
  });
};

function solveAffineMatrix(r1, s1, t1, r2, s2, t2, r3, s3, t3) {
  const a =
    ((t2 - t3) * (s1 - s2) - (t1 - t2) * (s2 - s3)) /
    ((r2 - r3) * (s1 - s2) - (r1 - r2) * (s2 - s3));
  const b =
    ((t2 - t3) * (r1 - r2) - (t1 - t2) * (r2 - r3)) /
    ((s2 - s3) * (r1 - r2) - (s1 - s2) * (r2 - r3));
  const c = t1 - r1 * a - s1 * b;
  return [a, b, c];
}

function deriveAffineTransform(a, b, c) {
  const e = 1e-15;
  a.xy.x -= e;
  a.xy.y += e;
  b.xy.x += e;
  b.xy.y -= e;
  c.xy.x += e;
  c.xy.y += e;
  const x = solveAffineMatrix(
    a.xy.x,
    a.xy.y,
    a.latLonMeters.x,
    b.xy.x,
    b.xy.y,
    b.latLonMeters.x,
    c.xy.x,
    c.xy.y,
    c.latLonMeters.x
  );
  const y = solveAffineMatrix(
    a.xy.x,
    a.xy.y,
    a.latLonMeters.y,
    b.xy.x,
    b.xy.y,
    b.latLonMeters.y,
    c.xy.x,
    c.xy.y,
    c.latLonMeters.y
  );
  return x.concat(y);
}

const icons = [
  colorIcon("blue"),
  colorIcon("red"),
  colorIcon("green"),
  colorIcon("orange"),
];
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
	"mapant-fi": L.tileLayer(
		"https://wmts.mapant.fi/wmts_EPSG3857.php?z={z}&x={x}&y={y}",
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
		"https://tile-proxy.routechoices.com/uk/{z}/{x}/{y}.webp",
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
		"https://tile-proxy.routechoices.com/ch/{z}/{x}/{y}.webp",
		{
			attribution: "&copy; MapAnt.ch",
			className: "wms256",
		},
	),
	"mapant-se": L.tileLayer(
		"https://tile-proxy.routechoices.com/se/{z}/{x}/{y}.webp",
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

function getBaseLayers() {
  return {
    "Open Street Map": cloneLayer(backdropMaps["osm"]),
    "Google Map Street": cloneLayer(backdropMaps["gmap-street"]),
    "Google Map Satellite": cloneLayer(backdropMaps["gmap-hybrid"]),
    "Google Map Terrain": cloneLayer(backdropMaps["gmap-terrain"]),
    "Mapant Finland": cloneLayer(backdropMaps["mapant-fi"]),
    "Mapant Norway": cloneLayer(backdropMaps["mapant-no"]),
    "Mapant Spain": cloneLayer(backdropMaps["mapant-es"]),
    "Mapant Sweden": cloneLayer(backdropMaps["mapant-se"]),
    "Mapant Switzerland": cloneLayer(backdropMaps["mapant-ch"]),
    "Topo Finland": cloneLayer(backdropMaps["topo-fi"]),
    "Topo France": cloneLayer(backdropMaps["topo-fr"]),
    "Topo Norway": cloneLayer(backdropMaps["topo-no"]),
    "Topo UK": cloneLayer(backdropMaps["topo-uk"]),
    "Topo World (OpenTopo)": cloneLayer(backdropMaps["topo-world"]),
    "Topo World (ArcGIS)": cloneLayer(backdropMaps["topo-world-alt"]),
  };
}

const CalibrationTool = (props) => {
  const { onValue, route, mapDataURL } = props;

  const [mapWorld, setMapWorld] = useState();
  const [mapRaster, setMapRaster] = useState();
  const [markersWorld, setMarkersWorld] = useState([]);
  const [markersRaster, setMarkersRaster] = useState([]);
  const [isReady, setIsReady] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [imgDataURI, setImgDataURI] = useState(null);
  const [imgWidth, setImgWidth] = useState(0);
  const [imgHeight, setImgHeight] = useState(0);
  const [threePointsWarning, set3pointsWarning] = useState(false);
  const mapWDiv = useRef(null);
  const mapRDiv = useRef(null);
  const [leafletWMap, setLeafletWMap] = useState(null);
  const [leafletRMap, setLeafletRMap] = useState(null);
  function getCornerCoordinates() {
    const rasterXY = [];
    const worldXY = [];
    const proj = new SpheroidProjection();

    let cornersLatlng = [];
    if (markersRaster.length === 4 && markersWorld.length === 4) {
      for (let i = 0; i < 4; i++) {
        rasterXY[i] = mapRaster.project(markersRaster[i].getLatLng(), 0);
        worldXY[i] = proj.latlngToMeters(markersWorld[i].getLatLng());
      }
      const matrix3d = general2DProjection(
        rasterXY[0],
        worldXY[0],
        rasterXY[1],
        worldXY[1],
        rasterXY[2],
        worldXY[2],
        rasterXY[3],
        worldXY[3]
      );
      const corners = [
        project(matrix3d, 0, 0),
        project(matrix3d, imgWidth, 0),
        project(matrix3d, imgWidth, imgHeight),
        project(matrix3d, 0, imgHeight),
      ];
      for (let i = 0; i < corners.length; i++) {
        cornersLatlng[i] = proj.metersToLatLng(
          new Point(corners[i][0], corners[i][1])
        );
      }
    } else if (markersRaster.length >= 3 && markersWorld.length >= 3) {
      const calPts = [];
      for (var i = 0; i < 3; i++) {
        rasterXY[i] = mapRaster.project(markersRaster[i].getLatLng(), 0);
        worldXY[i] = proj.latlngToMeters(markersWorld[i].getLatLng());
        calPts.push({
          latLonMeters: worldXY[i],
          xy: rasterXY[i],
        });
      }
      const xyToLatLngMetersCoeffs = deriveAffineTransform(...calPts);
      function mapXYtoLatLng(xy) {
        const x =
          xy.x * xyToLatLngMetersCoeffs[0] +
          xy.y * xyToLatLngMetersCoeffs[1] +
          xyToLatLngMetersCoeffs[2];
        const y =
          xy.x * xyToLatLngMetersCoeffs[3] +
          xy.y * xyToLatLngMetersCoeffs[4] +
          xyToLatLngMetersCoeffs[5];
        return proj.metersToLatLng(new Point(x, y));
      }
      cornersLatlng = [
        mapXYtoLatLng(new Point(0, 0)),
        mapXYtoLatLng(new Point(imgWidth, 0)),
        mapXYtoLatLng(new Point(imgWidth, imgHeight)),
        mapXYtoLatLng(new Point(0, imgHeight)),
      ];
    }
    return cornersLatlng;
  }

  useEffect(() => {
    if (
      markersWorld.length >= 3 &&
      markersRaster.length >= 3 &&
      !(markersWorld.length === 4 && markersRaster.length === 4)
    ) {
      set3pointsWarning(true);
    } else {
      set3pointsWarning(false);
    }
    if (markersRaster.length >= 3 && markersWorld.length >= 3) {
      setIsReady(true);
    } else {
      setIsReady(false);
    }
  }, [markersRaster, markersWorld]);

  const onClickRaster = (e) => {
    if (markersRaster.length < 4) {
      const marker = L.marker(
        mapRaster.unproject(mapRaster.project(e.latlng, 0), 0),
        { icon: icons[markersRaster.length], draggable: "true" }
      ).addTo(mapRaster);
      setMarkersRaster([...markersRaster, marker]);
    }
  };

  useEffect(() => {
    if (mapRaster) {
      mapRaster.off("click");
      mapRaster.on("click", onClickRaster);
    }
    // eslint-disable-next-line
  }, [mapRaster, markersRaster]);

  const onClickWorld = (e) => {
    if (markersWorld.length < 4) {
      const marker = L.marker(e.latlng, {
        icon: icons[markersWorld.length],
        draggable: "true",
      }).addTo(mapWorld);
      setMarkersWorld([...markersWorld, marker]);
    }
  };

  useEffect(() => {
    if (mapWorld) {
      mapWorld.off("click");
      mapWorld.on("click", onClickWorld);
    }
    // eslint-disable-next-line
  }, [mapWorld, markersWorld]);

  useEffect(() => {
    if (!(mapWDiv && mapRDiv)) {
      return
    }
    resetOrientation(mapDataURL, function (imgDataURI, width, height) {
      if (L.DomUtil.get('mapRaster')._leaflet_id) {return}
      setImgDataURI(imgDataURI);
      setImgWidth(width);
      setImgHeight(height);
      const tmpMapRaster = L.map("mapRaster", {
        crs: L.CRS.Simple,
        minZoom: -5,
        maxZoom: 2,
        zoomSnap: 0,
        scrollWheelZoom: true,
      });
      setLeafletRMap(tmpMapRaster)
      const boundsRaster = [
        tmpMapRaster.unproject([0, 0]),
        tmpMapRaster.unproject([width, height]),
      ];
      L.imageOverlay(imgDataURI, boundsRaster).addTo(tmpMapRaster);
      tmpMapRaster.fitBounds(boundsRaster);
      setMapRaster(tmpMapRaster);
    });
    // display world map;
    const routeData = route || [];
    if (L.DomUtil.get('mapWorld')._leaflet_id) return;
    const tmpMapWorld = L.map("mapWorld", {
      zoomSnap: 0,
      scrollWheelZoom: true,
    });
    setLeafletWMap(tmpMapWorld)
    const latlngs = routeData.map((pt) => pt.latlng.slice(0, 2));
    const polyline = L.polyline(latlngs, { color: "red" }).addTo(tmpMapWorld);
    if (routeData.length > 1) {
      tmpMapWorld.fitBounds(polyline.getBounds());
    } else {
      tmpMapWorld.setView([0, 0], 2);
    }

    const baseLayers = getBaseLayers();
    const defaultLayer = baseLayers["Open Street Map"];

    tmpMapWorld.addLayer(defaultLayer);
    const controlLayers = new L.Control.Layers(baseLayers);
    tmpMapWorld.addControl(controlLayers);
    if (L.Browser.touch && L.Browser.mobile) {
      tmpMapWorld.on("baselayerchange", function (e) {
        controlLayers.collapse();
      });
    }
    setMapWorld(tmpMapWorld);
    // eslint-disable-next-line
  }, [mapWDiv, mapRDiv]);

  return (
    <>
      <div style={{ display: previewOpen ? "none" : "block" }}>
        <div className="row">
          <div className="col-md-12">
            <div className="alert alert-info" role="alert">
              <span id="help_text">
                Indicate the location of 4 distincts references points both on
                your map and on the world map.
              </span>
            </div>
          </div>
        </div>
        <div className="row">
          <div className="col-md-6">
            <div id="mapRaster" ref={mapRDiv} className="leaflet_map calibration_map"></div>
            <button
              type="button"
              className="btn btn-danger mb-3"
              onClick={() => {
                for (let i = 0; i < markersRaster.length; i++) {
                  markersRaster[i].remove();
                }
                setMarkersRaster([]);
              }}
            >
              Delete Your Map Reference Points
            </button>
          </div>
          <div className="col-md-6">
            <div id="mapWorld" ref={mapWDiv} className="leaflet_map calibration_map"></div>
            <button
              type="button"
              className="btn btn-danger mb-3"
              onClick={() => {
                for (let i = 0; i < markersWorld.length; i++) {
                  markersWorld[i].remove();
                }
                setMarkersWorld([]);
              }}
            >
              Delete World Map Reference Points
            </button>
          </div>
        </div>
        {threePointsWarning && (<div className="alert alert-info" role="alert">
          <span>You have set 3 matching reference points, this may be enough and you may continue to the next step, however we recommend to set a 4th reference point if the map image has been captured from a camera.</span>
        </div>)}
        <div className="row">
          <div className="col-md-12">
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                onValue(null);
              }}
            >
              <i className="fas fa-undo"></i> Back
            </button>
            &nbsp;
            <button
              type="button"
              className="btn btn-primary"
              data-testid="to-validation"
              disabled={!isReady}
              onClick={() => setPreviewOpen(true)}
            >
              <i className="fas fa-arrow-alt-circle-right"></i> Test Calibration
            </button>
          </div>
        </div>
      </div>
      {previewOpen && (
        <CalibrationPreview
          imgDataURI={imgDataURI}
          cornersCoordinates={getCornerCoordinates()}
          route={route}
          onValue={(v) => {
            if (v) {
              onValue(v);
            }
            setPreviewOpen(false);
          }}
        ></CalibrationPreview>
      )}
    </>
  );
};

export default CalibrationTool;
