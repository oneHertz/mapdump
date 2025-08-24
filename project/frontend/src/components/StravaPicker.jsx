import React from "react";
import { DateTime } from "luxon";
import Swal from "sweetalert2";

import { printTime } from "../utils/drawHelpers";
import useGlobalState from "../utils/useGlobalState";
import logo from "../strava.png";
import connectWStrava from "../connectWithStrava.png";

const Settings = (props) => {
  const globalState = useGlobalState();
  const { api_token } = globalState.user;
  const [stravaToken, setStravaToken] = React.useState();
  const [act, setAct] = React.useState([]);
  const [loading, setLoading] = React.useState();
  const [page, setPage] = React.useState(1);
  React.useEffect(() => {
    if (api_token) {
      (async () => {
        const res = await fetch(
          import.meta.env.VITE_API_URL + "/v1/strava/token",
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Token " + api_token,
            },
          }
        );
        if (res.status === 401) {
          setStravaToken(null);
          globalState.setUser({});
        }
        try {
          const data = await res.json();
          setStravaToken(data.strava_access_token);
        } catch {}
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api_token]);

  React.useEffect(() => {
    (async () => {
      if (stravaToken) {
        setLoading(true);
        try {
          const routesRaw = await fetch(
            "https://www.strava.com/api/v3/athlete/activities?per_page=10&page=" + page,
            {
              headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + stravaToken,
              },
            }
          );
          const routes = await routesRaw.json();
          setAct(routes);
        } catch {
          setStravaToken(null);
        } finally {
          setLoading(false);
        }
      }
    })();
  }, [stravaToken, page]);

  if (!stravaToken) {
    const url = "https://www.strava.com/oauth/authorize";
    const qp = new URLSearchParams();
    qp.set("client_id", import.meta.env.VITE_STRAVA_CLIENT_ID);
    qp.set(
      "redirect_uri",
      import.meta.env.VITE_API_URL +
        "/v1/strava/authorization?auth_token=" +
        api_token
    );
    qp.set("response_type", "code");
    qp.set("approval_prompt", "auto");
    qp.set("scope", "activity:read_all,activity:write,read");
    return (
      <>
        or{" "}
        <a href={`${url}?${qp.toString()}`}>
          <img height="50px" src={connectWStrava} alt="With strava" />
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
            Authorization: "Bearer " + stravaToken,
          },
        }
      );
      console.log(a.id);
      const act = await actRaw.json();
      const dataRaw = await fetch(
        "https://www.strava.com/api/v3/activities/" +
          a.id +
          "/streams?key_by_type=true&keys=time,latlng&resolution=low",
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + stravaToken,
          },
        }
      );
      console.log("8")
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
        authKey: stravaToken,
        id: a.id,
        description: act.description,
      });
    } catch (e) {
      console.log(e);
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
        alt="With strava"
        style={{ mixBlendMode: "multiply" }}
        className="mr-5"
      />
      {stravaToken && loading ? (
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
