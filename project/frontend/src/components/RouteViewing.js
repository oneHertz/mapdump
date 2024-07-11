import React, { useEffect, useState, useMemo, useCallback } from "react";
import { getCorners } from "../utils/drawHelpers";
import { saveAs } from "file-saver";
import RouteHeader from "./RouteHeader";
import ShareModal from "./ShareModal";
import { saveKMZ } from "../utils/fileHelpers";
import useGlobalState from "../utils/useGlobalState";
import * as L from "leaflet";
import RangeSlider from "react-range-slider-input";
import "react-range-slider-input/dist/style.css";
import { LatLng, cornerCalTransform, resetOrientation } from "../utils";
import Swal from "sweetalert2";
import "../utils/Leaflet.ImageTransform";
import "../utils/leaflet-rotate";

const round5 = (v) => {
  return Math.round(v * 1e5) / 1e5;
};

const printCornersCoords = (corners_coords, separator) => {
  return [
    corners_coords.top_left.lat,
    corners_coords.top_left.lng,
    corners_coords.top_right.lat,
    corners_coords.top_right.lng,
    corners_coords.bottom_right.lat,
    corners_coords.bottom_right.lng,
    corners_coords.bottom_left.lat,
    corners_coords.bottom_left.lng,
  ]
    .map((c) => round5(c))
    .join(separator);
};

const RouteViewing = (props) => {
  const [route, setRoute] = useState(false);
  const [mapImage, setMapImage] = useState(false);
  const [includeHeader, setIncludeHeader] = useState(true);
  const [includeRoute, setIncludeRoute] = useState(true);
  const [name, setName] = useState();
  const [isPrivate, setIsPrivate] = useState(props.isPrivate);
  const [togglingRoute, setTogglingRoute] = useState();
  const [togglingHeader, setTogglingHeader] = useState();
  const [imgURL, setImgURL] = useState(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [leafletRoute, setLeafletRoute] = useState(null);
  const [croppingRange, setCroppingRange] = useState([0, 100]);
  const [savingCrop, setSavingCrop] = useState(false);
  const [leafletMap, setLeafletMap] = useState(null);
  const [isBoundSet, setIsBoundSet] = useState(null);
  const globalState = useGlobalState();
  const { api_token, username } = globalState.user;

  const imgRatio = useMemo(() => {
    return !mapImage.width ? "16/9" : "" + mapImage.width / mapImage.height;
  }, [mapImage]);

  const canEdit = useMemo(() => {
    return username === props.athlete.username;
  }, [username, props.athlete.username]);

  useEffect(() => {
    const qp = new URLSearchParams();
    qp.set("m", props.modificationDate);
    if (!includeHeader && !includeRoute) {
      qp.set("out_bounds", "1");
    }
    if (includeHeader) {
      qp.set("show_header", "1");
    }
    if (includeRoute) {
      qp.set("show_route", "1");
    }
    if (isPrivate) {
      qp.set("auth_token", api_token);
    }
    const url = props.mapDataURL + "?" + qp.toString();
    setImgURL(url);
  }, [
    includeHeader,
    includeRoute,
    props.mapDataURL,
    props.modificationDate,
    isPrivate,
    api_token,
  ]);

  useEffect(() => {
    setName(props.name);
  }, [props.name]);

  useEffect(() => {
    const arch = [];
    props.route.forEach((p) =>
      arch.push({
        timestamp: p?.time,
        coords: { latitude: p.latlng[0], longitude: p.latlng[1] },
      })
    );
    setRoute(arch);
  }, [props.route]);

  useEffect(() => {
    var img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = function () {
      const width = img.width,
        height = img.height;
      setMapImage({ imgURL, width, height });
      setTogglingHeader(false);
      setTogglingRoute(false);
      setImgLoaded(true);
    };
    img.src = imgURL;
  }, [imgURL]);

  useEffect(() => {
    if (leafletMap && mapImage) {
      leafletMap.eachLayer(function (layer) {
        leafletMap.removeLayer(layer);
      });
      leafletMap.invalidateSize();
      const bounds = [
        leafletMap.unproject([0, 0], 0),
        leafletMap.unproject([mapImage.width, mapImage.height], 0),
      ];
      new L.imageOverlay(mapImage.imgURL, bounds).addTo(leafletMap);

      setIsBoundSet((isBoundSet) => {
        if (!isBoundSet) {
          leafletMap.fitBounds(bounds);
        }
        return true;
      });

      if (cropping) {
        const transform = cornerCalTransform(
          mapImage.width,
          mapImage.height,
          props.mapCornersCoords.top_left,
          props.mapCornersCoords.top_right,
          props.mapCornersCoords.bottom_right,
          props.mapCornersCoords.bottom_left
        );
        const routeLatLng = [];
        route.forEach(function (pos) {
          if (!isNaN(pos.coords.latitude)) {
            const pt = transform(
              new LatLng(pos.coords.latitude, pos.coords.longitude)
            );
            routeLatLng.push([-pt.y, pt.x]);
          }
        });
        const t = L.polyline(routeLatLng, {
          color: "red",
          opacity: 0.75,
          weight: 5,
        });
        t.addTo(leafletMap);
        setLeafletRoute(t);
      }
    }
  }, [leafletMap, mapImage, cropping, props.mapCornersCoords, route]);

  const downloadMap = () => {
    const newCorners = getCorners(
      props.mapSize,
      props.mapCornersCoords,
      props.route,
      includeHeader,
      includeRoute
    );
    const downloadName =
      name +
      "_" +
      (includeRoute ? "" : "blank_") +
      printCornersCoords(newCorners, "_") +
      "_.jpg";
    fetch(imgURL)
      .then((r) => r.blob())
      .then((b) => saveAs(b, downloadName));
  };

  const downloadKmz = (e) => {
    fetch(props.mapDataURL + (isPrivate ? "?auth_token=" + api_token : ""))
      .then((r) => r.blob())
      .then((blob) => {
        const newCorners = getCorners(
          props.mapSize,
          props.mapCornersCoords,
          [],
          false,
          false
        );
        saveKMZ(name + "_blank.kmz", name, newCorners, blob);
      });
  };

  const downloadGPX = (ev) => {
    saveAs(
      props.gpx + (isPrivate ? "?auth_token=" + api_token : ""),
      name + ".gpx"
    );
  };

  const toggleHeader = (ev) => {
    if (togglingHeader) {
      return;
    }
    setIncludeHeader(!includeHeader);
    setTogglingHeader(true);
  };

  const toggleRoute = (ev) => {
    if (togglingRoute) {
      return;
    }
    setIncludeRoute(!includeRoute);
    setTogglingRoute(true);
  };

  const hasRouteTime = useMemo(() => {
    return !!props.route[0].time;
  }, [props.route]);

  let webShareApiAvailable = false;
  if (navigator.canShare) {
    webShareApiAvailable = true;
  }

  const [shareModalOpen, setShareModalOpen] = useState(false);
  const share = () => {
    if (webShareApiAvailable) {
      try {
        navigator
          .share({ url: document.location.href })
          .then(() => {})
          .catch(() => {});
      } catch (e) {}
    } else {
      setShareModalOpen(true);
    }
  };

  const cropRoute = () => {
    setImgLoaded(false);
    setMapImage(false);
    resetOrientation(
      props.mapDataURL + (props.isPrivate ? "?auth_token=" + api_token : ""),
      function (_, width, height) {
        setMapImage({
          imgURL:
            props.mapDataURL +
            (props.isPrivate ? "?auth_token=" + api_token : ""),
          width,
          height,
        });
        setIsBoundSet(false);
        setCropping(true);
        setImgLoaded(true);
        const bounds = [
          leafletMap.unproject([0, 0], 0),
          leafletMap.unproject([mapImage.width, mapImage.height], 0),
        ];
        leafletMap.fitBounds(bounds);
      }
    );
  };

  const onCropChange = (range) => {
    setCroppingRange(range);
    const minIdx = Math.floor((range[0] * route.length) / 100);
    const maxIdx = Math.ceil((range[1] * route.length) / 100);
    const arr = route.slice(minIdx, maxIdx);

    const transform = cornerCalTransform(
      mapImage.width,
      mapImage.height,
      props.mapCornersCoords.top_left,
      props.mapCornersCoords.top_right,
      props.mapCornersCoords.bottom_right,
      props.mapCornersCoords.bottom_left
    );
    const routeLatLng = [];
    arr.forEach(function (pos) {
      if (!isNaN(pos.coords.latitude)) {
        const pt = transform(
          new LatLng(pos.coords.latitude, pos.coords.longitude)
        );
        routeLatLng.push([-pt.y, pt.x]);
      }
    });
    leafletRoute.setLatLngs(routeLatLng);
  };

  const saveCropping = async () => {
    const minIdx = Math.floor((croppingRange[0] * route.length) / 100);
    const maxIdx = Math.ceil((croppingRange[1] * route.length) / 100);
    const arr = route.slice(minIdx, maxIdx);

    setSavingCrop(true);
    try {
      const response = await fetch(
        process.env.REACT_APP_API_URL + "/v1/route/" + props.id,
        {
          method: "PATCH",
          credentials: "omit",
          headers: {
            Authorization: "Token " + api_token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            route_data: arr.map((p) => {
              var pt = {
                latlon: [p.coords.latitude, p.coords.longitude],
                time: null,
              };
              if (p.timestamp) {
                pt.time = p.timestamp / 1e3;
              }
              return pt;
            }),
          }),
        }
      );
      setSavingCrop(false);
      if (response.status !== 200) {
        Swal.fire({
          title: "Error!",
          text: "Something went wrong!",
          icon: "error",
          confirmButtonText: "OK",
        });
        return;
      }
      window.location.reload();
    } catch (e) {}
  };

  const mapRef = useCallback((node) => {
    if (node !== null) {
      const newMap = L.map(node, {
        crs: L.CRS.Simple,
        minZoom: -5,
        maxZoom: 2,
        zoomSnap: 0,
        scrollWheelZoom: true,
        rotate: true,
        rotateControl: false,
        touchRotate: true,
        zoomControl: false,
        attributionControl: false,
      });
      setLeafletMap(newMap);
    } else {
      setLeafletMap(null);
    }
  }, []);

  return (
    <>
      <div className="container main-container">
        <RouteHeader
          {...props}
          onNameChanged={setName}
          onPrivacyChanged={setIsPrivate}
        />
        {!cropping && (
          <>
            <div>
              {!isPrivate && (
                <button
                  style={{ marginBottom: "5px" }}
                  className="btn btn-sm btn-warning"
                  onClick={share}
                >
                  <i className="fas fa-share"></i> Share
                </button>
              )}
              <br />
              <button
                style={{ marginBottom: "5px" }}
                className="btn btn-sm btn-success"
                onClick={downloadMap}
              >
                <i className="fas fa-download"></i> JPEG{" "}
                {`(Map${includeRoute ? " w/ Route" : ""})`}
              </button>
              &nbsp;
              <button
                style={{ marginBottom: "5px" }}
                className="btn btn-sm btn-success"
                onClick={downloadKmz}
                data-testid="dl-kmz"
              >
                <i className="fas fa-download"></i> KMZ (Map)
              </button>
              &nbsp;
              <button
                style={{ marginBottom: "5px" }}
                className="btn btn-sm btn-success"
                onClick={downloadGPX}
              >
                <i className="fas fa-download"></i> GPX (Route)
              </button>
              {canEdit && (
                <>
                  &nbsp;
                  <button
                    style={{ marginBottom: "5px" }}
                    className="btn btn-sm btn-primary"
                    onClick={cropRoute}
                  >
                    <i className="fas fa-cut"></i> Crop GPS
                  </button>
                </>
              )}
              {hasRouteTime && (
                <button
                  style={{ marginBottom: "5px" }}
                  className="btn btn-sm btn-primary float-right"
                  onClick={props.togglePlayer}
                >
                  <i className="fas fa-play"></i> View animation
                </button>
              )}
            </div>
            <div>
              <button className="btn btn-sm btn-default" onClick={toggleHeader}>
                <i
                  className={
                    togglingHeader
                      ? "fa fa-spinner fa-spin"
                      : "fa fa-toggle-" + (includeHeader ? "on" : "off")
                  }
                  style={includeHeader ? { color: "#3c2" } : {}}
                ></i>{" "}
                Header
              </button>
              &nbsp;
              <button className="btn btn-sm btn-default" onClick={toggleRoute}>
                <i
                  className={
                    togglingRoute
                      ? "fa fa-spinner fa-spin"
                      : "fa fa-toggle-" + (includeRoute ? "on" : "off")
                  }
                  style={includeRoute ? { color: "#3c2" } : {}}
                ></i>{" "}
                Route
              </button>
            </div>
          </>
        )}
      </div>
      <div className="container-fluid">
        <div>
          {cropping && imgLoaded && (
            <div className="container">
              <h3>Crop GPS</h3>
              <button
                className="btn btn-primary mb-3 mr-1"
                onClick={saveCropping}
                disabled={savingCrop}
              >
                <i className="fas fa-save"></i> Save
              </button>
              <button
                className="btn btn-danger mb-3"
                onClick={() => window.location.reload()}
                disabled={savingCrop}
              >
                <i className="fas fa-times"></i> Cancel
              </button>
              <RangeSlider
                className={"mb-3"}
                defaultValue={[0, 100]}
                step={0.001}
                onInput={onCropChange}
              />
            </div>
          )}
          {imgLoaded && (
            <center>
              <div
                ref={mapRef}
                style={{
                  background: "rgba(0,0,0,0.03)",
                  width: "100%",
                  aspectRatio: imgRatio,
                  maxHeight: "calc(100vh - 100px)",
                }}
              ></div>
              {isBoundSet && <></>}
            </center>
          )}
          {!imgLoaded && (
            <center>
              <h3>
                <i className="fa fa-spin fa-spinner"></i> Loading...
              </h3>
            </center>
          )}
        </div>
        {shareModalOpen && (
          <ShareModal
            url={document.location.href}
            onClose={() => setShareModalOpen(false)}
          />
        )}
      </div>
    </>
  );
};

export default RouteViewing;
