import React, { useEffect, useState, useMemo, useCallback } from "react";
import { getCorners } from "../utils/drawHelpers";
import { saveAs } from "file-saver";
import RouteHeader from "./RouteHeader";
import ShareModal from "./ShareModal";
import CornerCoordsInput from "./CornerCoordsInput";
import CommentsModal from "./CommentsModal";
import { saveKMZ } from "../utils/fileHelpers";
import useGlobalState from "../utils/useGlobalState";
import * as L from "leaflet";
import RangeSlider from "react-range-slider-input";
import "react-range-slider-input/dist/style.css";
import { LatLng, cornerCalTransform, resetOrientation } from "../utils";
import Swal from "sweetalert2";
import ReactTooltip from "react-tooltip";
import { capitalizeFirstLetter } from "../utils";
import { GestureHandling } from "leaflet-gesture-handling";

import "../utils/Leaflet.ImageTransform";
import "../utils/leaflet-rotate";
import "leaflet-gesture-handling/dist/leaflet-gesture-handling.css";

L.Map.addInitHook("addHandler", "gestureHandling", GestureHandling);

const joinAnd = (a, sep, fSep) => {
  if (a.length < 2) return a.join('')
  return  a.slice(0, -1).join(sep)+fSep+a.slice(-1);
}

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
  const [includeRoute, setIncludeRoute] = useState(true);
  const [name, setName] = useState();
  const [isPrivate, setIsPrivate] = useState(props.isPrivate);
  const [togglingRoute, setTogglingRoute] = useState();
  const [togglingHeader, setTogglingHeader] = useState();
  const [imgLoaded, setImgLoaded] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [reCalibrating, setReCalibrating] = useState(false);
  const [leafletRoute, setLeafletRoute] = useState(null);
  const [croppingRange, setCroppingRange] = useState([0, 100]);
  const [savingCrop, setSavingCrop] = useState(false);
  const [leafletMap, setLeafletMap] = useState(null);
  const [isBoundSet, setIsBoundSet] = useState(null);
  const [likes, setLikes] = useState([]);
  const [comments, setComments] = useState([]);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const globalState = useGlobalState();
  const { api_token, username } = globalState.user;

  const imgRatio = useMemo(() => {
    return !mapImage.width ? "16/9" : "" + mapImage.width / mapImage.height;
  }, [mapImage]);

  const canEdit = useMemo(() => {
    return username === props.athlete.username;
  }, [username, props.athlete.username]);

  const canLike = useMemo(() => {
    return username && username !== props.athlete.username && !likes.find((like) => like.user.username === username)
  }, [username, props.athlete.username, likes]);

  const canComment = useMemo(() => {
    return username
  }, [username]);

  const likers = useMemo(() => {
    return joinAnd(likes.map((like) => {
      return like.user.username === username ? "You" : (like.user.first_name && like.user.last_name ?
        capitalizeFirstLetter(like.user.first_name) +
        " " +
        capitalizeFirstLetter(like.user.last_name)
        : like.user.username)
    }), ',\n', ',\nand ');
  }, [likes, username]);

  const imageUrl = useMemo(() => {
    const qp = new URLSearchParams();
    qp.set("m", props.modificationDate);
    qp.set("show_header", "1");
    if (includeRoute) {
      qp.set("show_route", "1");
    }
    if (isPrivate) {
      qp.set("auth_token", api_token);
    }
    return props.mapDataURL + "?" + qp.toString();
  }, [
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
    setLikes(props.thumbsUp);
    ReactTooltip.rebuild();
  }, [props.thumbsUp]);

  useEffect(() => {
    setComments(props.comments);
  }, [props.comments]);

  useEffect(() => {
    var img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = function () {
      const width = img.width,
        height = img.height;
      setMapImage({ url: imageUrl, width, height });
      setTogglingHeader(false);
      setTogglingRoute(false);
      setImgLoaded(true);
    };
    img.src = imageUrl;
  }, [imageUrl]);

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
      new L.imageOverlay(mapImage.url, bounds).addTo(leafletMap);

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

  const getImageName = (includeRoute=true) => {
    const newCorners = getCorners(
      props.mapSize,
      props.mapCornersCoords,
      props.route,
      true,
      includeRoute
    );
    return name +
      (includeRoute ? "" : "_blank_") +
      printCornersCoords(newCorners, "_") +
      "_.jpg";
  }

  const downloadMapRoute = () => {
    const qp = new URLSearchParams();
    qp.set("m", props.modificationDate);
    qp.set("show_header", "1");
    qp.set("show_route", "1");
    if (isPrivate) {
      qp.set("auth_token", api_token);
    }
    const url = props.mapDataURL + "?" + qp.toString();
    fetch(url)
      .then((r) => r.blob())
      .then((b) => saveAs(b, getImageName(true)));
  };

  const downloadMap = () => {
    const qp = new URLSearchParams();
    qp.set("m", props.modificationDate);
    qp.set("show_header", "1");
    if (isPrivate) {
      qp.set("auth_token", api_token);
    }
    const url = props.mapDataURL + "?" + qp.toString();
    fetch(url)
      .then((r) => r.blob())
      .then((b) => saveAs(b, getImageName(false)));
  };

  const downloadKmz = () => {
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
          .share({ url: "https://mapdu.mp/r/" + props.id })
          .then(() => {})
          .catch(() => {});
      } catch (e) {}
    } else {
      setShareModalOpen(true);
    }
  };

  const reCalibrate = (e) => {
    e.preventDefault()
    setReCalibrating(true);
    setCropping(false);
  }

  const cropRoute = (e) => {
    e.preventDefault()
    setReCalibrating(false);
    setImgLoaded(false);
    setMapImage(false);
    resetOrientation(
      props.mapDataURL + (props.isPrivate ? "?auth_token=" + api_token : ""),
      function (_, width, height) {
        setMapImage({
          url:
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

  const grantMedal = async (e) => {
    e.preventDefault();
    setLikes((l) => [...l, {user: {username}}]);
    await fetch(
        import.meta.env.VITE_API_URL + "/v1/route/" + props.id + "/like",
        {
          method: "POST",
          credentials: "omit",
          headers: {
            Authorization: "Token " + api_token,
            "Content-Type": "application/json",
          },
        }
    );
  }

  const dislike = async (e) => {
    e.preventDefault();
    if (!likes.find((ll) => ll.user.username === username)) {return}
    setLikes((l) => l.filter((ll) => ll.user.username !== username));
    await fetch(
        import.meta.env.VITE_API_URL + "/v1/route/" + props.id + "/like",
        {
          method: "POST",
          credentials: "omit",
          headers: {
            Authorization: "Token " + api_token,
            "Content-Type": "application/json",
          },
        }
    );
  }

  const onSubmitComment = async (e) => {
    e.preventDefault()
    const formData = new FormData(e.target);
    const formProps = Object.fromEntries(formData);
    const newId = await fetch(
      import.meta.env.VITE_API_URL + "/v1/route/" + props.id + "/comment",
      {
        method: "POST",
        credentials: "omit",
        headers: {
          Authorization: "Token " + api_token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({message: formProps.message})
      }
    ).then((r) => r.json()).then((r) => r.id);
    setComments((c) => [{message: formProps.message, user: {username}, id: newId}, ...c]);
    e.target.reset();
  }

  const onDeleteComment = async (e, id) => {
    e.preventDefault()
    await fetch(
      import.meta.env.VITE_API_URL + "/v1/route/" + props.id + "/comment/" + id,
      {
        method: "DELETE",
        credentials: "omit",
        headers: {
          Authorization: "Token " + api_token,
          "Content-Type": "application/json",
        },
      }
    );
    setComments((c) => c.filter((cc) => cc.id !== id));
    e.target.reset();
  }

  const saveCropping = async () => {
    const minIdx = Math.floor((croppingRange[0] * route.length) / 100);
    const maxIdx = Math.ceil((croppingRange[1] * route.length) / 100);
    const arr = route.slice(minIdx, maxIdx);

    setSavingCrop(true);
    try {
      const response = await fetch(
        import.meta.env.VITE_API_URL + "/v1/route/" + props.id,
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

  const patchCalibration = async (val) => {
    const cc = val.split(",").map(f => parseFloat(f));
    try {
      const response = await fetch(
        import.meta.env.VITE_API_URL + "/v1/route/" + props.id,
        {
          method: "PATCH",
          credentials: "omit",
          headers: {
            Authorization: "Token " + api_token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            map_bounds: {
              top_left: [cc[0], cc[1]],
              top_right: [cc[2], cc[3]],
              bottom_right: [cc[4], cc[5]],
              bottom_left: [cc[6], cc[7]],
            }
          })
        }
      );
      setReCalibrating(false);
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
}

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
        gestureHandling: true,
      });
      setLeafletMap(newMap);
    } else {
      setLeafletMap(null);
    }
  }, []);

  const openComments = () => {
    setCommentsOpen(true)
  }
  return (
    <>
      <div className="container main-container">
        <RouteHeader
          {...props}
          onNameChanged={setName}
          onPrivacyChanged={setIsPrivate}
          cropRoute={cropRoute}
          reCalibrate={reCalibrate}
        />
        {!(cropping || reCalibrating) && (
          <>
            <div className="d-flex justify-content-between">
              <div>
                <button type="button" className="btn btn-sm border" onClick={toggleRoute} style={{ marginBottom: "5px" }}>
                  <i
                    className={
                      "fa fa-fw fa-" + (togglingRoute
                        ? "spinner fa-spin"
                        : "toggle-" + (includeRoute ? "on" : "off")
                      )
                    }
                    style={includeRoute ? { color: "#3c2" } : {}}
                  ></i>{" "}
                  Route
                </button>
              </div>
              <div>
                <button
                  type="button"
                  style={{ marginBottom: "5px" }}
                  className="btn btn-sm btn-success"
                  onClick={downloadMapRoute}
                >
                  <i className="fas fa-download"></i> <span>Map+Route</span>
                </button>
                &nbsp;<button
                  type="button"
                  style={{ marginBottom: "5px" }}
                  className="btn btn-sm btn-success"
                  onClick={downloadMap}
                >
                  <i className="fas fa-download"></i> <span>Map</span>
                </button>
                &nbsp;
                <button
                  type="button"
                  style={{ marginBottom: "5px" }}
                  className="btn btn-sm btn-success"
                  onClick={downloadKmz}
                  data-testid="dl-kmz"
                >
                  <i className="fas fa-download"></i> <span>KMZ</span>
                </button>
                &nbsp;
                <button
                  type="button"
                  style={{ marginBottom: "5px" }}
                  className="btn btn-sm btn-success"
                  onClick={downloadGPX}
                >
                  <i className="fas fa-download"></i> <span>GPX</span>
                </button>
              </div>
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
                type="button"
                className="btn btn-primary mb-3 mr-1"
                onClick={saveCropping}
                disabled={savingCrop}
              >
                <i className="fas fa-save"></i> Save
              </button>
              <button
                type="button"
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
          {reCalibrating && imgLoaded && (
            <div className="container">
               <div><h1>Re-Calibrate</h1>
               <CornerCoordsInput mapDataURL={props.mapDataURL + (props.isPrivate ? "?auth_token=" + api_token : "")} onUndo={() => setReCalibrating(false)} coordsCallback={(val) => patchCalibration(val)} route={route.map((pt) => ({time: pt.timestamp, latlng: [pt.coords.latitude, pt.coords.longitude]}))}></CornerCoordsInput>
               </div>
            </div>
          )}
          {!reCalibrating && imgLoaded && (
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
        <div className="container">
          <div className="my-3 float-right">
            <button type="button" className="btn btn-primary font-weight-bold font-italic mr-1" onClick={openComments}>
              {comments.length} <i className="fa fa-comment"></i>
            </button>
            <>
            <span data-tip data-for="likers">
              <button type="button" className="font-weight-bold font-italic btn-primary btn mr-1" onClick={canLike ? grantMedal : dislike}>
                {likes.length}&nbsp;<i className="fa fa-hands-clapping" />
              </button>
            </span>
            <ReactTooltip place="right" id="likers">
              <div style={{whiteSpace: "pre"}}>{likes.length === 0 ? (canLike ? "Be first to like": "No love so far") : likers}</div>
            </ReactTooltip>
            </>
            {!isPrivate && (
                <button
                  type="button"
                  className="btn btn-warning ml-1"
                  onClick={share}
                >
                  <i className="fas fa-share"></i> Share
                </button>
              )}
            </div>
          </div>
        {shareModalOpen && (
          <ShareModal
            url={"https://mapdu.mp/r/" + props.id}
            onClose={() => setShareModalOpen(false)}
          />
        )}
        {commentsOpen && (
          <CommentsModal
            comments={comments}
            username={username}
            canComment={canComment}
            onComment={onSubmitComment}
            deleteComment={onDeleteComment}
            onClose={() => setCommentsOpen(false)}
          />
        )}
      </div>
    </>
  );
};

export default RouteViewing;
