import React, { useEffect, useState, createRef } from "react";
import Swal from "sweetalert2";
import { saveAs } from "file-saver";
import {
  drawRoute,
  drawOriginalMap,
  getCorners,
  scaleImage,
} from "../utils/drawHelpers";
import useGlobalState from "../utils/useGlobalState";
import { saveKMZ } from "../utils/fileHelpers";
import ReactTooltip from "react-tooltip";
import { DateTime } from "luxon";

let startTime = null;

const RouteDrawing = (props) => {
  const [name, setName] = useState();
  const [includeHeader, setIncludeHeader] = useState(true);
  const [includeRoute, setIncludeRoute] = useState(true);
  const [togglingRoute, setTogglingRoute] = useState();
  const [rotating, setRotating] = useState();
  const [togglingHeader, setTogglingHeader] = useState();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [imgData, setImgData] = useState();
  const [imgURL, setImgURL] = useState(null);
  const [zoom, setZoom] = useState(100);
  const [bounds, setBounds] = useState(props.mapCornersCoords);
  const [redraw, setRedraw] = useState(true);

  let finalImage = createRef();

  const globalState = useGlobalState();
  const { username, api_token } = globalState.user;

  useEffect(() => {
    window.plausible("Map Created");
  }, []);

  useEffect(() => {
    if (!imgData) {
      return;
    }
    if (redraw) {
      const canvas = drawRoute(
        imgData,
        bounds,
        props.route,
        includeHeader,
        includeRoute
      );
      const imgURL = canvas.toDataURL();
      setImgURL(imgURL);
      setTogglingRoute(false);
      setTogglingHeader(false);
      setRotating(false);
      setRedraw(false);
    }
  }, [imgData, bounds, includeHeader, includeRoute, props.route, redraw]);

  useEffect(() => {
    setName(props.name);
  }, [props.name]);

  useEffect(() => {
    var img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = function () {
      setImgData(this);
    };
    img.src = props.mapDataURL;
  }, [props.mapDataURL]);

  const round5 = (v) => {
    return Math.round(v * 1e5) / 1e5;
  };

  const formatMapBounds = (b) => {
    return JSON.stringify({
      top_left: [b.top_left.lat, b.top_left.lng],
      top_right: [b.top_right.lat, b.top_right.lng],
      bottom_right: [b.bottom_right.lat, b.bottom_right.lng],
      bottom_left: [b.bottom_left.lat, b.bottom_left.lng],
    });
  };
  const formatRoute = (r) => {
    return JSON.stringify(
      r.map((p) => {
        return { time: +p.time / 1e3, latlon: p.latlng };
      })
    );
  };

  const printCornersCoords = (corners_coords, separator) => {
    return (
      "" +
      round5(corners_coords.top_left.lat) +
      separator +
      round5(corners_coords.top_left.lng) +
      separator +
      round5(corners_coords.top_right.lat) +
      separator +
      round5(corners_coords.top_right.lng) +
      separator +
      round5(corners_coords.bottom_right.lat) +
      separator +
      round5(corners_coords.bottom_right.lng) +
      separator +
      round5(corners_coords.bottom_left.lat) +
      separator +
      round5(corners_coords.bottom_left.lng)
    );
  };

  const rotate = () => {
    if (rotating) {
      return;
    }
    setRotating(true);
    let imgOrig = imgData;
    const mWidth = imgOrig.width;
    const mHeight = imgOrig.height;
    const MAX = 3000;

    if (mHeight > MAX || mWidth > MAX) {
      imgOrig = scaleImage(imgOrig, MAX / Math.max(mHeight, mWidth));
    }

    let canvas = document.createElement("canvas");
    canvas.width = imgOrig.height;
    canvas.height = imgOrig.width;
    const ctx = canvas.getContext("2d");
    ctx.rotate((90 * Math.PI) / 180);
    ctx.drawImage(imgOrig, 0, -imgOrig.height);
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = function () {
      setBounds({
        top_left: bounds.bottom_left,
        top_right: bounds.top_left,
        bottom_right: bounds.top_right,
        bottom_left: bounds.bottom_right,
      });
      setImgData(this);
      setRedraw(true);
    };
    const dataURL = canvas.toDataURL("image/png");
    img.src = dataURL;
  };

  useEffect(() => {
    if (saving) {
      window.onbeforeunload = () => true;
    } else {
      window.onbeforeunload = undefined;
    }
    window.mapdumpSaving = saving;
  }, [saving]);

  const onExport = async (makePrivate) => {
    if (saving || !username) {
      return;
    }
    const tkn = api_token;
    setSaving(true);
    if (!props.route[0].time) {
      const { value: isSet } = await Swal.fire({
        title: "Enter your start time",
        html: '<input id="startDatePicker" type="datetime-local" autofocus class="swal2-input">',
        inputValue: new Date(),
        showCancelButton: true,
        didOpen: function () {
          document.getElementById("startDatePicker").value =
            DateTime.local().toFormat("yyyy-LL-dd'T'HH:mm");
        },
        preConfirm: function () {
          try {
            startTime = new Date(
              document.getElementById("startDatePicker").value
            );
          } catch {
            startTime = null;
          }
        },
      });
      if (!isSet || !startTime) {
        setSaving(false);
        return;
      }
    }

    const mWidth = imgData.width;
    const mHeight = imgData.height;
    const MAX = 3000;
    let canvas = null;
    if (mHeight > MAX || mWidth > MAX) {
      canvas = scaleImage(imgData, MAX / Math.max(mHeight, mWidth));
    } else {
      canvas = drawOriginalMap(imgData);
    }
    const comment = `${props.stravaDetails.description || ""}${
      props.stravaDetails.description && props.stravaDetails.id
        ? "\r\n\r\n"
        : ""
    }${
      props.stravaDetails.id
        ? `https://www.strava.com/activities/${props.stravaDetails.id}`
        : ""
    }`;
    fetch(canvas.toDataURL("image/jpeg", 0.8))
      .then((res) => res.blob())
      .then(async (blob) => {
        const fd = new FormData();
        fd.append("map_image", blob, name + ".jpg");

        fd.append("map_bounds", formatMapBounds(bounds));
        fd.append("route_data", formatRoute(props.route));
        fd.append("name", name);
        fd.append("comment", comment);
        if (!props.route[0].time) {
          fd.append("start_time", startTime.toISOString());
        }
        if (makePrivate) {
          fd.append("is_private", true);
        }
        try {
          const response = await fetch(
            import.meta.env.VITE_API_URL + "/v1/routes/new",
            {
              method: "POST",
              credentials: "omit",
              headers: {
                Authorization: "Token " + tkn,
              },
              body: fd,
            }
          );
          if (response.status === 200 || response.status === 201) {
            let res;
            try {
              res = await response.json(); // parses JSON response into native JavaScript objects
            } catch (e) {
              setSaving(false);
              Swal.fire({
                title: "Error!",
                text: "Error parsing response from server!",
                icon: "error",
                confirmButtonText: "OK",
              });
              return;
            }
            if (
              !makePrivate &&
              props.stravaDetails.authKey &&
              props.stravaDetails.id
            ) {
              const description = `${props.stravaDetails.description || ""}${
                props.stravaDetails.description && res.id ? "\r\n\r\n" : ""
              }${res.id ? `https://mapdu.mp/r/${res.id}` : ""}`;
              try {
                await fetch(
                  "https://www.strava.com/api/v3/activities/" +
                    props.stravaDetails.id,
                  {
                    method: "PUT",
                    body: JSON.stringify({
                      description: description,
                    }),
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: "Bearer " + props.stravaDetails.authKey,
                    },
                  }
                );
              } catch {}
            }
            setSaving(false);
            setSaved(res.id);
            props.history.push("/routes/" + res.id);
          } else {
            setSaving(false);
            Swal.fire({
              title: "Error!",
              text: "Server replied with not ok status!",
              icon: "error",
              confirmButtonText: "OK",
            });
          }
        } catch (e) {
          console.log(e)
          setSaving(false);
          Swal.fire({
            title: "Error!",
            text: "Error connecting to server!",
            icon: "error",
            confirmButtonText: "OK",
          });
        }
      });
  };

  const downloadMapWithRoute = (e) => {
    const newCorners = getCorners(
      imgData,
      bounds,
      props.route,
      includeHeader,
      includeRoute
    );
    const canvas = drawRoute(
      imgData,
      bounds,
      props.route,
      includeHeader,
      includeRoute
    );
    canvas.toBlob(
      function (blob) {
        saveAs(
          blob,
          name +
            (includeRoute ? "_" : "_blank_") +
            printCornersCoords(newCorners, "_") +
            "_.jpg"
        );
      },
      "image/jpeg",
      0.8
    );
  };

  const downloadKmz = (e) => {
    const newCorners = getCorners(imgData, bounds, [], false, false);
    const canvas = drawRoute(imgData, bounds, [], false, false);
    canvas.toBlob(
      function (blob) {
        saveKMZ(name + "_blank.kmz", name, newCorners, blob);
      },
      "image/jpeg",
      0.8
    );
  };

  const toggleHeader = (ev) => {
    if (togglingHeader) {
      return;
    }
    setIncludeHeader(!includeHeader);
    setTogglingHeader(true);
    setRedraw(true);
  };

  const toggleRoute = (ev) => {
    if (togglingRoute) {
      return;
    }
    setIncludeRoute(!includeRoute);
    setTogglingRoute(true);
    setRedraw(true);
  };

  const zoomOut = () => {
    setZoom(zoom - 10);
  };

  const zoomIn = () => {
    setZoom(zoom + 10);
  };

  return (
    <>
      <div className="container main-container">
        <h2>
          <input
            style={{ width: "100%" }}
            type="text"
            data-testid="nameInput"
            maxLength={52}
            defaultValue={name}
            onChange={(e) => setName(e.target.value)}
          />
        </h2>
        <div>
          <button
            type="button"
            style={{ marginBottom: "5px" }}
            className="btn btn-sm btn-success"
            onClick={downloadMapWithRoute}
          >
            <i className="fas fa-download"></i> JPEG{" "}
            {`(Map${includeRoute ? " w/ Route" : ""})`}
          </button>
          &nbsp;
          <button
            type="button"
            style={{ marginBottom: "5px" }}
            className="btn btn-sm btn-success"
            data-testid="dl-kmz"
            onClick={downloadKmz}
          >
            <i className="fas fa-download"></i> KMZ (Map)
          </button>
        </div>
        <button className="btn btn-sm btn-default" onClick={zoomIn}>
          <i className={"fa fa-plus"}></i>
        </button>
        &nbsp;
        <button className="btn btn-sm btn-default" onClick={zoomOut}>
          <i className={"fa fa-minus"}></i>
        </button>
        &nbsp;
        <button className="btn btn-sm btn-default" onClick={toggleHeader}>
          <i
            className={
              togglingHeader
                ? "fa fa-spinner fa-spin"
                : "fa fa-toggle-" + (includeHeader ? "on" : "off")
            }
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
          ></i>{" "}
          Route
        </button>
        &nbsp;
        <button className="btn btn-sm btn-default" onClick={rotate}>
          <i className={rotating ? "fa fa-spinner fa-spin" : "fa fa-sync"}></i>{" "}
          Rotate
        </button>
        &nbsp;
        {!saved && username && (
          <div style={{ float: "right" }}>
            <button
              type="button"
              data-testid="saveBtn2"
              className="btn btn-sm btn-secondary"
              onClick={() => onExport(true)}
            >
              <i
                className={saving ? "fa fa-spinner fa-spin" : "fas fa-save"}
              ></i>{" "}
              Save as Private
            </button>{" "}
            <button
              type="button"
              data-testid="saveBtn"
              className="btn btn-sm btn-primary"
              onClick={() => onExport()}
            >
              <i
                className={saving ? "fa fa-spinner fa-spin" : "fas fa-save"}
              ></i>{" "}
              Save
            </button>
          </div>
        )}
        {!saved && !username && (
          <span style={{ float: "right" }} data-tip={"Login/Signup to Save"}>
            <button
              data-testid="saveBtnDisabled"
              className="btn btn-sm btn-primary"
              disabled
            >
              <i className="fas fa-save"></i> Save
            </button>
            &nbsp;
          </span>
        )}
      </div>
      <div className="container-fluid">
        {imgURL && (
          <center>
            <img
              ref={finalImage}
              className="final-image"
              src={imgURL}
              alt="route"
              onClick={toggleRoute}
              style={{ marginTop: "5px", width: zoom + "%" }}
            />
          </center>
        )}
        {!imgURL && (
          <h3>
            <i className="fa fa-spin fa-spinner"></i> Loading...
          </h3>
        )}
      </div>
      <ReactTooltip place="top" />
    </>
  );
};

export default RouteDrawing;
