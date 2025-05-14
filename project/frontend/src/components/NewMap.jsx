import React, { useEffect } from "react";
import JSZip from "jszip";
import { pdfjs as pdfjsLib } from "react-pdf";
import Swal from "sweetalert2";
import FitParser from "fit-file-parser";
import gpxParser from "gpxparser";
import GPXDropzone from "./GPXDrop";
import ImageDropzone from "./ImgDrop";
import RouteDrawing from "./RouteDrawing";
import PathDrawing from "./PathDrawing";
import LiveloxPicker from "./LiveloxPicker";
import StravaPicker from "./StravaPicker";
import CornerCoordsInput from "./CornerCoordsInput";
import useGlobalState from "../utils/useGlobalState";
import {
  extractCornersCoordsFromFilename,
  validateCornersCoords,
} from "../utils/fileHelpers";
import { parseTCXString } from "../utils/tcxParser";
import { LatLng, bytesToBase64 } from "../utils";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.min.js',
  import.meta.url,
).toString();

function NewMap({history}) {
  const globalState = useGlobalState();
  const { username } = globalState.user;
  const [route, _setRoute] = React.useState();
  const [drawRoute, setDrawRoute] = React.useState(false);
  const [mapCornersCoords, setMapCornersCoords] = React.useState();
  const [mapDataURL, _setMapDataURL] = React.useState();
  const [name, setName] = React.useState();
  const [stravaDetails, setStravaDetails] = React.useState("");

  const setRoute = (newRoute) => {
    _setRoute(newRoute);
  };
  const setMapDataURL = (newMapDataURL) => {
    _setMapDataURL(newMapDataURL);
  };

  const acceptedFormats = {
    "image/jpeg": true,
    "image/gif": true,
    "image/png": true,
    "image/webp": true,
    "image/avif": true,
  };

  const onRouteLoaded = (newRoute) => {
    if (!newRoute?.length) {
      Swal.fire({
        title: "Error!",
        text: "Error parsing your file! No GPS points detected!",
        icon: "error",
        confirmButtonText: "OK",
      });
      return;
    }
    setRoute(newRoute);
  };

  const onGPXLoaded = (e) => {
    const xml = e.target.result;
    let gpx;
    try {
      gpx = new gpxParser();
      gpx.parse(xml);
    } catch (e) {
      Swal.fire({
        title: "Error!",
        text: "Error parsing your GPX file!",
        icon: "error",
        confirmButtonText: "OK",
      });
      return;
    }
    const newRoute = [];
    for (const pos of gpx.tracks[0]?.points || []) {
      if (pos.lat) {
        newRoute.push({ time: pos.time, latlng: [pos.lat, pos.lon] });
      }
    }
    onRouteLoaded(newRoute);
  };

  const onTCXParsed = (error, workout) => {
    if (error) {
      Swal.fire({
        title: "Error!",
        text: "Error parsing your TCX file!",
        icon: "error",
        confirmButtonText: "OK",
      });
      return;
    }
    const newRoute = [];
    workout.laps.forEach((lap) => {
      lap.track.forEach((pos) => {
        if (pos.latitude) {
          newRoute.push({
            time: +pos.datetime,
            latlng: [pos.latitude, pos.longitude],
          });
        }
      });
    });
    onRouteLoaded(newRoute);
  };

  const onTCXLoaded = (e) => {
    const xml = e.target.result;
    try {
      parseTCXString(xml, onTCXParsed);
    } catch (e) {
      Swal.fire({
        title: "Error!",
        text: "Error parsing your TCX file!",
        icon: "error",
        confirmButtonText: "OK",
      });
    }
  };

  const onFITLoaded = (e) => {
    var fitParser = new FitParser({
      force: true,
      speedUnit: "km/h",
      lengthUnit: "km",
      temperatureUnit: "celsius",
      elapsedRecordField: "timer_time",
      mode: "list",
    });
    fitParser.parse(e.target.result, function (error, data) {
      if (error) {
        Swal.fire({
          title: "Error!",
          text: "Error parsing your FIT file!",
          icon: "error",
          confirmButtonText: "OK",
        });
      } else {
        const newRoute = [];
        data.records.forEach((rec) => {
          if (rec.position_lat) {
            newRoute.push({
              time: +rec.timestamp,
              latlng: [rec.position_lat, rec.position_long],
            });
          }
        });
        onRouteLoaded(newRoute);
      }
    });
  };

  const onDropGPX = (acceptedFiles) => {
    if (!acceptedFiles.length) {
      return;
    }
    const gpxFile = acceptedFiles[0];
    const filename = gpxFile.name;
    setName(filename.slice(0, -4).slice(0, 52));
    const fr = new FileReader();
    if (filename.toLowerCase().endsWith(".tcx")) {
      fr.onload = onTCXLoaded;
    } else if (filename.toLowerCase().endsWith(".fit")) {
      fr.onload = onFITLoaded;
      fr.readAsArrayBuffer(gpxFile);
      return;
    } else {
      fr.onload = onGPXLoaded;
    }
    fr.readAsText(gpxFile);
  };

  const onImgLoaded = (e) => {
    var imageUri = e.target.result;
    setMapDataURL(imageUri);
  };

  const deg2rad = (deg) => (deg * Math.PI) / 180;

  const computeBoundsFromLatLonBox = (n, e, s, w, rot) => {
    const a = (e + w) / 2;
    const b = (n + s) / 2;
    const squish = Math.cos(deg2rad(b));
    const x = (squish * (e - w)) / 2;
    const y = (n - s) / 2;

    const ne = [
      b + x * Math.sin(deg2rad(rot)) + y * Math.cos(deg2rad(rot)),
      a + (x * Math.cos(deg2rad(rot)) - y * Math.sin(deg2rad(rot))) / squish,
    ];
    const nw = [
      b - x * Math.sin(deg2rad(rot)) + y * Math.cos(deg2rad(rot)),
      a - (x * Math.cos(deg2rad(rot)) + y * Math.sin(deg2rad(rot))) / squish,
    ];
    const sw = [
      b - x * Math.sin(deg2rad(rot)) - y * Math.cos(deg2rad(rot)),
      a - (x * Math.cos(deg2rad(rot)) - y * Math.sin(deg2rad(rot))) / squish,
    ];
    const se = [
      b + x * Math.sin(deg2rad(rot)) - y * Math.cos(deg2rad(rot)),
      a + (x * Math.cos(deg2rad(rot)) + y * Math.sin(deg2rad(rot))) / squish,
    ];
    return [nw, ne, se, sw];
  };

  const extractKMZInfo = async (kmlText, kmz) => {
    const parser = new DOMParser();
    const parsedText = parser.parseFromString(kmlText, "text/xml");
    const go = parsedText.getElementsByTagName("GroundOverlay")[0];
    const nameEl = parsedText.getElementsByTagName("name")[0].innerHTML;
    if (go) {
      try {
        const latLonboxElNodes = go.getElementsByTagName("LatLonBox");
        const latLonQuadElNodes = go.getElementsByTagName("gx:LatLonQuad");
        const filePath = go.getElementsByTagName("href")[0].innerHTML;
        const buff = await kmz.file(filePath).async("uint8array");
        const filename = kmz.file(filePath).name;
        const extension = filename.toLowerCase().split(".").pop();
        let mime = "";
        console.log(extension)
        if (extension === "jpg") {
          mime = "image/jpeg";
        } else if (["png", "gif", "jpeg", "webp", "avif"].includes(extension)) {
          mime = "image/" + extension;
        }
        const imageDataURI = "data:" + mime + ";base64," + bytesToBase64(buff);
        let bounds;
        if (latLonboxElNodes.length) {
          const latLonboxEl = latLonboxElNodes[0];
          bounds = computeBoundsFromLatLonBox(
            parseFloat(latLonboxEl.getElementsByTagName("north")[0].innerHTML),
            parseFloat(latLonboxEl.getElementsByTagName("east")[0].innerHTML),
            parseFloat(latLonboxEl.getElementsByTagName("south")[0].innerHTML),
            parseFloat(latLonboxEl.getElementsByTagName("west")[0].innerHTML),
            parseFloat(
              latLonboxEl.getElementsByTagName("rotation")[0]
                ? latLonboxEl.getElementsByTagName("rotation")[0].innerHTML
                : 0
            )
          );
        } else if (latLonQuadElNodes) {
          const latLonQuadEl = latLonQuadElNodes[0];
          let [sw, se, ne, nw] = latLonQuadEl
            .getElementsByTagName("coordinates")[0]
            .innerHTML.trim()
            .split(" ");
          nw = nw.split(",");
          ne = ne.split(",");
          se = se.split(",");
          sw = sw.split(",");
          bounds = [
            [parseFloat(nw[1]), parseFloat(nw[0])],
            [parseFloat(ne[1]), parseFloat(ne[0])],
            [parseFloat(se[1]), parseFloat(se[0])],
            [parseFloat(sw[1]), parseFloat(sw[0])],
          ];
        } else {
          throw new Error("No coordinates");
        }
        return {
          name: nameEl,
          bounds: {
            top_left: new LatLng(bounds[0][0], bounds[0][1]),
            top_right: new LatLng(bounds[1][0], bounds[1][1]),
            bottom_right: new LatLng(bounds[2][0], bounds[2][1]),
            bottom_left: new LatLng(bounds[3][0], bounds[3][1]),
          },
          imageDataURI,
        };
      } catch (e) {
        Swal.fire({
          title: "Error!",
          text: "Error parsing your KMZ file!",
          icon: "error",
          confirmButtonText: "OK",
        });
        return;
      }
    } else {
      Swal.fire({
        title: "Error!",
        text: "Error parsing your KMZ file!",
        icon: "error",
        confirmButtonText: "OK",
      });
      return;
    }
  };

  const onKmzLoaded = async (file) => {
    const zip = await JSZip.loadAsync(file);
    if (zip.files && zip.files["doc.kml"]) {
      const kml = await zip.file("doc.kml").async("string");
      const data = await extractKMZInfo(kml, zip);
      if (data) {
        setMapDataURL(data.imageDataURI);
        setMapCornersCoords(data.bounds);
      }
    } else {
      Swal.fire({
        title: "Error!",
        text: "Error parsing your KMZ file!",
        icon: "error",
        confirmButtonText: "OK",
      });
    }
  };

  const onPdfLoaded = async (ev) => {
    const file = ev.target.result;
    var loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(file) });
    loadingTask.promise.then(function (pdf) {
      pdf.getPage(1).then(function (page) {
        var PRINT_RESOLUTION = 300;
        var PRINT_UNITS = PRINT_RESOLUTION / 72.0;
        var viewport = page.getViewport({ scale: 1 });

        // Prepare canvas using PDF page dimensions
        var canvas = document.createElement("canvas");
        canvas.height = Math.floor(viewport.height * PRINT_UNITS);
        canvas.width = Math.floor(viewport.width * PRINT_UNITS);
        var context = canvas.getContext("2d");
        // Render PDF page into canvas context
        var renderContext = {
          canvasContext: context,
          transform: [PRINT_UNITS, 0, 0, PRINT_UNITS, 0, 0],
          viewport: viewport,
        };
        var renderTask = page.render(renderContext);
        renderTask.promise.then(function () {
          setMapDataURL(canvas.toDataURL("image/jpeg", 0.8));
        });
      });
    });
  };

  const onDropImg = (acceptedFiles) => {
    if (!acceptedFiles.length) {
      return;
    }
    const file = acceptedFiles[0];
    const filename = file.name;
    if (acceptedFormats[file.type]) {
      const reader = new FileReader();
      reader.onload = onImgLoaded;
      reader.readAsDataURL(file);
      const foundCornersCoords = extractCornersCoordsFromFilename(file.name);
      if (foundCornersCoords && validateCornersCoords(foundCornersCoords)) {
        var c = foundCornersCoords.split(",").map(function (c) {
          return parseFloat(c);
        });
        setMapCornersCoords({
          top_left: new LatLng(c[0], c[1]),
          top_right: new LatLng(c[2], c[3]),
          bottom_right: new LatLng(c[4], c[5]),
          bottom_left: new LatLng(c[6], c[7]),
        });
      }
    } else if (filename.toLowerCase().endsWith(".kmz")) {
      onKmzLoaded(file);
    } else if (filename.toLowerCase().endsWith(".pdf")) {
      var fr = new FileReader();
      fr.onload = onPdfLoaded;
      fr.readAsArrayBuffer(file);
    } else {
      Swal.fire({
        title: "Error!",
        text: "Invalid image format",
        icon: "error",
        confirmButtonText: "OK",
      });
    }
  };
  const onSetCornerCoords = (foundCornersCoords) => {
    if (foundCornersCoords && validateCornersCoords(foundCornersCoords)) {
      var c = foundCornersCoords.split(",").map(function (c) {
        return parseFloat(c);
      });
      setMapCornersCoords({
        top_left: new LatLng(c[0], c[1]),
        top_right: new LatLng(c[2], c[3]),
        bottom_right: new LatLng(c[4], c[5]),
        bottom_left: new LatLng(c[6], c[7]),
      });
    }
  };
  const onRemoveMap = () => {
    setMapDataURL(null);
    setMapCornersCoords(null);
  };
  const onRestart = () => {
    setRoute(null);
    setMapDataURL("");
    setMapCornersCoords(null);
    setDrawRoute(false);
  };

  useEffect(() => {
    const myUrl = new URL(window.location.href.replace(/#/g, "?"));
    const kmzUrl = myUrl.searchParams.get("kmz");
    const gpxUrl = myUrl.searchParams.get("gpx");
    const title = myUrl.searchParams.get("title");
    if (title) {
      setName(title.slice(0, 52));
    }
    if (kmzUrl) {
      (async () => {
        const resp = await fetch(kmzUrl);
        if (resp.ok) {
          const kmz = await resp.arrayBuffer();
          await onKmzLoaded(kmz);
        }
      })();
    }
    if (gpxUrl) {
      (async () => {
        const resp = await fetch(gpxUrl);
        if (resp.ok) {
          const gpx = await resp.text();
          onGPXLoaded({ target: { result: gpx } });
        }
      })();
    }
    // eslint-disable-next-line
  }, []);

  return (
    <>
      <div className="container main-container">
        <div className="App">
          {!route && !drawRoute && (
            <>
              <h1>GPS File</h1>
              <GPXDropzone onDrop={onDropGPX} />
              {username && (
                <>
                  <hr />
                  <StravaPicker
                    onRouteDownloaded={(name, route, stravaInfo) => {
                      setStravaDetails(stravaInfo);
                      setName(name.slice(0, 52));
                      onRouteLoaded(route);
                    }}
                  />
                </>
              )}
              <hr />
              or{" "}
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setDrawRoute(true);
                  setName("Untitled Run");
                }}
              >
                <i className="fas fa-pen"></i> Draw route manually
              </button>
            </>
          )}
          {(drawRoute || route) && !mapDataURL && (
            <>
              <h1>Map Image File</h1>
              <ImageDropzone onDrop={onDropImg} />
              <hr/>
              <LiveloxPicker onSubmit={onDropImg}></LiveloxPicker>
              <hr/>
              <button type="button" className="btn btn-danger" onClick={onRestart}>
                <i className="fas fa-undo"></i> Back
              </button>
            </>
          )}
          {(drawRoute || route) && mapDataURL && !mapCornersCoords && (
            <>
              <h1>Calibration</h1>
              <CornerCoordsInput
                onSet={onSetCornerCoords}
                onUndo={onRemoveMap}
                coordsCallback={onSetCornerCoords}
                route={route}
                mapDataURL={mapDataURL}
              />
            </>
          )}
          {drawRoute && !route && mapDataURL && mapCornersCoords && (
            <PathDrawing
              mapCornersCoords={mapCornersCoords}
              mapDataURL={mapDataURL}
              onRoute={setRoute}
              onUndo={() => onRemoveMap()}
            />
          )}
        </div>
      </div>
      {route && mapDataURL && mapCornersCoords && (
        <RouteDrawing
          route={route}
          mapCornersCoords={mapCornersCoords}
          mapDataURL={mapDataURL}
          name={name}
          stravaDetails={stravaDetails}
          history={history}
        />
      )}
    </>
  );
}

export default NewMap;
