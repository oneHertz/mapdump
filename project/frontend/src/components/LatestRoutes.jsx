import React from "react";
import { Link } from "react-router-dom";
import { DateTime } from "luxon";
import LazyImage from "./LazyImage";
import { printPace, printTime } from "../utils/drawHelpers";
import useGlobalState from "../utils/useGlobalState";
import {
  capitalizeFirstLetter,
  displayDate,
  regionNames,
  getFlagEmoji,
} from "../utils";

const LatestRoute = (props) => {
  const [routes, setRoutes] = React.useState([]);
  const [isLoading, setLoading] = React.useState(true);
  const observerTarget = React.useRef(null);
  const nextPage = React.useRef(null);

  const globalState = useGlobalState();
  const { api_token } = globalState.user;

  React.useEffect(() => {
    nextPage.current =
      import.meta.env.VITE_API_URL +
      (props?.tag ? "/v1/routes-by-tag/" + props.tag : "/v1/latest-routes/");
  }, [props.tag]);

  const fetchData = React.useCallback(async () => {
    const url = nextPage.current;
    if (url) {
      setLoading(true);
      const headers = {};
      if (api_token) {
        headers.Authorization = "Token " + api_token;
      }
      try {
        const res = await fetch(url, {
          credentials: "omit",
          headers,
        });
        const resp = await res.json();
        if (resp.results) {
          setRoutes((routes) => [...routes, ...resp.results]);
        }
        nextPage.current = resp.next;
      } catch {
        // error handling
      } finally {
        setLoading(false);
      }
    }
  }, [api_token]);

  React.useEffect(() => {
    const currentTarget = observerTarget.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchData();
        }
      },
      { threshold: 1 }
    );
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [observerTarget, fetchData]);

  return (
    <>
      <h3 style={{ textAlign: "center" }}>
        {props?.tag
          ? 'Routes tagged "' + props.tag + '"'
          : "Latest Routes on Mapdump.com "}
        {!props?.tag && (
          <a href={import.meta.env.VITE_API_URL + "/v1/latest-routes/feed/"}>
            <i className="fa fa-rss" title="RSS"></i>
          </a>
        )}
      </h3>
      <div className="container" style={{ textAlign: "left" }}>
        {routes === false && (
          <div style={{ textAlign: "center" }}>
            <span>
              <i className="fa fa-spinner fa-spin"></i> Loading
            </span>
          </div>
        )}
        {routes &&
          (!routes.length && !isLoading ? (
            <div style={{ textAlign: "center" }}>
              <span>
                {props?.tag
                  ? 'No routes tagged "' + props.tag + '"...'
                  : "No routes have been yet uploaded..."}
              </span>
            </div>
          ) : (
            <div className="row">
              {routes.map((r) => (
                <div
                  key={r.id}
                  className="col-12 col-md-4"
                  style={{ marginBottom: "15px" }}
                >
                  <div className="card route-card">
                    <Link to={"/routes/" + r.id}>
                      <LazyImage
                        src={
                          r.map_thumbnail_url +
                          (r.is_private ? "?auth_token=" + api_token : "")
                        }
                        alt="map thumbnail"
                      ></LazyImage>
                    </Link>
                    <div className="card-body">
                      <div style={{ display: "flex", justifyContent: "start" }}>
                        <div
                          style={{ marginRight: "10px", textAlign: "center" }}
                        >
                          <img
                            src={
                              import.meta.env.VITE_AVATAR_ROOT +
                              "/athletes/" +
                              r.athlete.username +
                              ".png"
                            }
                            alt="profile"
                            style={{ borderRadius: "50%", width: "40px" }}
                          ></img>
                          <br />
                          <span
                            title={regionNames.of(r.country)}
                            className="countryFlags"
                            style={{ fontSize: "1.5em", margin: "5px" }}
                          >
                            {getFlagEmoji(r.country)}
                          </span>
                        </div>
                        <div
                          style={{
                            width: "calc(100% - 46px)",
                            borderLeft: "1px solid #B4B4B4",
                          }}
                        >
                          <div className="card-text">
                            <div style={{ paddingLeft: "5px" }}>
                              <div
                                style={{
                                  color: "black",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                <Link
                                  style={{ zIndex: 2, position: "relative" }}
                                  to={"/athletes/" + r.athlete.username}
                                >
                                  {r.athlete.first_name && r.athlete.last_name
                                    ? capitalizeFirstLetter(
                                        r.athlete.first_name
                                      ) +
                                      " " +
                                      capitalizeFirstLetter(r.athlete.last_name)
                                    : r.athlete.username}
                                </Link>
                              </div>
                              <div style={{ fontSize: "0.8em" }}>
                                {displayDate(
                                  DateTime.fromISO(r.start_time, {
                                    zone: r.tz,
                                  })
                                )}
                              </div>
                              <div
                                style={{
                                  color: "black",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                <b>
                                  <Link
                                    style={{
                                      color: "black",
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                    }}
                                    to={"/routes/" + r.id}
                                    className={"stretched-link"}
                                  >
                                    {r.name}
                                  </Link>
                                </b>
                              </div>
                            </div>
                            <div style={{ marginLeft: "-1px" }}>
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "start",
                                  gap: "5px",
                                  flexFlow: "row wrap",
                                  fontSize: "0.8em",
                                }}
                              >
                                <div
                                  style={{
                                    borderLeft: "1px solid #B4B4B4",
                                    paddingLeft: "5px",
                                  }}
                                >
                                  <span style={{ color: "#666" }}>
                                    Distance
                                  </span>
                                  <br />
                                  {(r.distance / 1000).toFixed(1) + "km"}
                                </div>
                                {r.duration ? (
                                  <>
                                    <div
                                      style={{
                                        borderLeft: "1px solid #B4B4B4",
                                        paddingLeft: "5px",
                                      }}
                                    >
                                      <span style={{ color: "#666" }}>
                                        Duration
                                      </span>
                                      <br />
                                      {printTime(r.duration * 1000)}
                                    </div>
                                    <div
                                      style={{
                                        borderLeft: "1px solid #B4B4B4",
                                        paddingLeft: "5px",
                                      }}
                                    >
                                      <span style={{ color: "#666" }}>
                                        Pace
                                      </span>
                                      <br />
                                      {printPace(
                                        (r.duration / r.distance) * 1000
                                      )}
                                    </div>
                                  </>
                                ) : (
                                  ""
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        {isLoading && <div>Loading...</div>}
        <div ref={observerTarget}>&nbsp;</div>
      </div>
    </>
  );
};

export default LatestRoute;
