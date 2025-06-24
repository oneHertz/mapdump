import React from "react";
import { DateTime } from "luxon";
import Swal from "sweetalert2";

import { printTime } from "../utils/drawHelpers";
import useGlobalState from "../utils/useGlobalState";
import logo from "../garmin.png";

const Settings = (props) => {
  const globalState = useGlobalState();
  const { api_token } = globalState.user;
  const [garminToken, setGarminToken] = React.useState();
  const [act, setAct] = React.useState([]);
  const [loading, setLoading] = React.useState();
  const [page, setPage] = React.useState(1);
  
  React.useEffect(() => {
    if (api_token) {
      (async () => {
        const res = await fetch(
          import.meta.env.VITE_API_URL + "/v1/garmin/token",
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Token " + api_token,
            },
          }
        );
        if (res.status === 401) {
          setGarminToken(null);
          globalState.setUser({});
        }
        try {
          const data = await res.json();
          setGarminToken(data.garmin_access_token);
        } catch {}
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api_token]);

  React.useEffect(() => {
    (async () => {
      if (garminToken) {
        setLoading(true);
        try {
          const routesRaw = await fetch(
            "https://www.strava.com/api/v3/athlete/activities?per_page=10&page=" + page,
            {
              headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + garminToken,
              },
            }
          );
          const routes = await routesRaw.json();
          setAct(routes);
        } catch {
          setGarminToken(null);
        } finally {
          setLoading(false);
        }
      }
    })();
  }, [garminToken, page]);

  if (!garminToken) {
    const url = "https://connect.garmin.com/oauth2Confirm";
    const qp = new URLSearchParams();
    qp.set(
      "redirect_uri",
      import.meta.env.VITE_API_URL +
        "/v1/garmin/authorization"
    );
    qp.set("client_id", import.meta.env.VITE_GARMIN_CONSUMER_KEY);
    qp.set("state", api_token)
    qp.set("response_type", "code");
    qp.set("code_challenge", "SPm_5pfH5npMWwCQqRlqqS1NPUV5mkM63ucGPnFNFdQ")
    qp.set("code_challenge_method", "S256");
    return (
      <>
        or{" "}
        <a href={`${url}?${qp.toString()}`}>
          <img height="50px" src={logo} alt="With garmin" />
        </a>
      </>
    );
  }

  const downloadGPX = async (a) => {
    try {
      let times = null;
      let latlngs = null;
      const actRaw = await fetch(
        "https://www.strava.com/api/v3/activities/" + a.id,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + garminToken,
          },
        }
      );
      const act = await actRaw.json();
      const dataRaw = await fetch(
        "https://www.strava.com/api/v3/activities/" +
          a.id +
          "/streams?key_by_type=true&keys=time,latlng",
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + garminToken,
          },
        }
      );
      const data = await dataRaw.json();
      times = data.time.data;
      latlngs = data.latlng.data;
      if (latlngs.length === 0) {
        Swal.fire({
          title: "Error!",
          text: "This Strava activity does not seem contain any route!",
          icon: "error",
          confirmButtonText: "OK",
        });
        return;
      }
      const startTime = +new Date(a.start_date);
      const route = [];
      latlngs.forEach((pos, i) => {
        route.push({ time: startTime + ~~times[i] * 1e3, latlng: pos });
      });
      props.onRouteDownloaded(a.name, route, {
        authKey: garminToken,
        id: a.id,
        description: act.description,
      });
    } catch (e) {
      Swal.fire({
        title: "Error!",
        text: "Could not import this activity!",
        icon: "error",
        confirmButtonText: "OK",
      });
      return;
    }
  };

  return (
    <>
      <img
        height="50px"
        src={logo}
        alt="With garmin"
        style={{ mixBlendMode: "multiply" }}
        className="mr-5"
      />
      {garminToken && loading ? (
        <center>
          <h3>
            <i className="fa fa-spin fa-spinner"></i> Loading
          </h3>
        </center>
      ) : (
        <>
        <table className="table table-striped table-hover">
          <thead className="thead-dark">
            <tr>
              <th scope="col">Start Date</th>
              <th scope="col">Name</th>
              <th scope="col">Duration</th>
              <th scope="col">Distance</th>
            </tr>
          </thead>
          <tbody style={{ cursor: "pointer" }}>
            {act.map((a) => (
              <tr key={a.id} onClick={() => downloadGPX(a)}>
                <td>{DateTime.fromISO(a.start_date).toFormat("DDDD, T")}</td>
                <td>{a.name}</td>
                <td>
                  {printTime(a.elapsed_time * 1e3)}
                  {}
                </td>
                <td>{(a.distance / 1000).toFixed(1)}km</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn" onClick={() => setPage((p) => (p-1))} disabled={page === 1}><i className="fa fa-chevron-left"></i></button>
        <button type="button" className="btn" onClick={() => setPage((p) => (p+1))}><i className="fa fa-chevron-right"></i></button>
        </>
      )}
    </>
  );
};

export default Settings;
