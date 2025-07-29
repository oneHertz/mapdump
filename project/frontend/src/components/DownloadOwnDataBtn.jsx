import React from "react";
import { saveAs } from "file-saver";
import JSZip from "jszip";
import useGlobalState from "../utils/useGlobalState";
import { getCorners } from "../utils/drawHelpers";
import { getKMZ } from "../utils/fileHelpers";
import { LatLng } from "../utils";

const DownloadOwnDataBtn = () => {
  const [dl, setDl] = React.useState(null);
  const [routeCount, setRouteCount] = React.useState(0);

  const globalState = useGlobalState();
  const { username } = globalState.user;

  const transformMapBounds = (v) => {
    return {
      top_left: new LatLng(
        parseFloat(v.top_left[0]),
        parseFloat(v.top_left[1])
      ),
      top_right: new LatLng(
        parseFloat(v.top_right[0]),
        parseFloat(v.top_right[1])
      ),
      bottom_right: new LatLng(
        parseFloat(v.bottom_right[0]),
        parseFloat(v.bottom_right[1])
      ),
      bottom_left: new LatLng(
        parseFloat(v.bottom_left[0]),
        parseFloat(v.bottom_left[1])
      ),
    };
  };

  const downloadOwnData = async () => {
    const res = await fetch(
      import.meta.env.VITE_API_URL + "/v1/user/" + username
    );
    const { routes } = await res.json();
    setRouteCount(routes.length);
    const z = new JSZip();
    setDl(0);
    for (const r of routes) {
      const jsonData = await fetch(r.url).then((r) => r.json());
      const gpx = await fetch(jsonData.gpx_url).then((r) => r.blob());
      setDl((prevCount) => prevCount + 1 / 3);
      const kmz = await fetch(jsonData.map_url)
        .then((r) => r.blob())
        .then((blob) => {
          const newCorners = getCorners(
            jsonData.map_size,
            transformMapBounds(jsonData.map_bounds),
            [],
            false,
            false
          );
          const kmz_raw = getKMZ(jsonData.name, newCorners, blob);
          return kmz_raw.generateAsync({
            type: "blob",
            mimeType: "application/vnd.google-earth.kmz",
          });
        });
      setDl((prevCount) => prevCount + 1 / 3);
      const img = await fetch(
        jsonData.map_url + "?show_route=1&show_header=1"
      ).then((r) => r.blob());
      setDl((prevCount) => prevCount + 1 / 3);
      const folderName = r.name + " " + r.id;
      z.folder(folderName);
      z.file(folderName + "/route.gpx", gpx);
      z.file(folderName + "/map.kmz", kmz);
      z.file(folderName + "/map+route.jpg", img);
      z.file(folderName + "/data.json", JSON.stringify(jsonData, null, "    "));
      await new Promise((r) => setTimeout(r, 100));
    }
    z.generateAsync({ type: "blob" }).then(function (blob) {
      saveAs(
        blob,
        `mapdump_${username}_${new Date().toISOString().split("T")[0]}.zip`
      );
    });
    setDl(null);
  };

  return (
    <>
      <h3>
        <i className="fa fa-download"></i> Download own data
      </h3>
      {dl === null ? (
        <button type="button" className="btn btn-primary" onClick={downloadOwnData}>
          <i className="fa fa-download"></i> Download All Routes
        </button>
      ) : (
        <span className="badge bg-info text-light">
          Preparing archive {Math.min(100, Math.round((dl / routeCount) * 100))}
          %
        </span>
      )}
    </>
  );
};

export default DownloadOwnDataBtn;
