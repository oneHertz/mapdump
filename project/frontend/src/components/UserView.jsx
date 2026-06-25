import React from "react";
import { Helmet } from "react-helmet";
import { Link } from "react-router-dom";
import CalendarHeatmap from "react-calendar-heatmap";
import ReactTooltip from "react-tooltip";
import { DateTime } from "luxon";
import "react-calendar-heatmap/dist/styles.css";
import LazyImage from "./LazyImage";
import NotFound from "./NotFound";
import { printTime, printPace } from "../utils/drawHelpers";
import useGlobalState from "../utils/useGlobalState";
import {
  capitalizeFirstLetter,
  displayDate,
  regionNames,
  getFlagEmoji,
} from "../utils";

const urls = [
  "new",
  "map",
  "sign-up",
  "password-reset",
  "verify-email",
  "password-reset-confirmation",
  "settings",
  "account-deletion-confirmation",
];

const UserView = ({ match, history }) => {
  const [found, setFound] = React.useState(null);
  const [loading, setLoading] = React.useState(null);
  const [data, setData] = React.useState(null);
  const [routes, setRoutes] = React.useState([]);
  const [calendarVal, setCalendarVal] = React.useState([]);
  const [years, setYears] = React.useState([]);
  const [selectedYear, setSelectedYear] = React.useState(false);
  const [tooltip, showTooltip] = React.useState(false);
  const globalState = useGlobalState();
  const { api_token } = globalState.user;

  React.useEffect(() => {
    if (urls.includes(match.params.username)) {
      return;
    }
    (async () => {
      setLoading(true);
      const headers = {};
      if (api_token) {
        headers.Authorization = "Token " + api_token;
      }
      const res = await fetch(
        import.meta.env.VITE_API_URL + "/v1/user/" + match.params.username,
        {
          credentials: "omit",
          headers,
        }
      );
      if (res.status === 200) {
        const rawData = await res.json();
        setData(rawData);
        setFound(true);
      } else if (res.status === 404) {
        setFound(false);
      }
      setLoading(false);
    })();
  }, [match.params.username, api_token]);

  React.useEffect(() => {
    if (data?.username && match.params.username !== data?.username) {
      let url = `/athletes/${data.username}`;
      if (match.params.year) {
        url += `/${match.params.year}`;
      } else if (match.params.date) {
        url += `/${match.params.date}`;
      }
      history.push(url);
    }
    // eslint-disable-next-line
  }, [match.params.username, data?.username]);

  React.useEffect(() => {
    if (match.params.date) {
      setSelectedYear(match.params.date.slice(0, 4));
    } else if (match.params.year) {
      setSelectedYear(match.params.year);
    } else {
      setSelectedYear(false);
    }
    if (data?.routes) {
      if (match.params.date) {
        setRoutes(
          data.routes.filter(
            (r) =>
              DateTime.fromISO(r.start_time, { zone: r.tz }).toFormat(
                "yyyy-MM-dd"
              ) === match.params.date
          )
        );
      } else if (match.params.year) {
        setRoutes(
          data.routes.filter(
            (r) =>
              DateTime.fromISO(r.start_time, { zone: r.tz }).toFormat(
                "yyyy"
              ) === match.params.year
          )
        );
      } else {
        setRoutes(data.routes);
      }
    }
  }, [match.params.date, match.params.year, data?.routes]);

  React.useEffect(() => {
    const y = [];
    if (data?.routes) {
      data.routes.forEach((r) => {
        const year = DateTime.fromISO(r.start_time, { zone: r.tz }).toFormat(
          "yyyy"
        );
        if (!y.includes(year)) {
          y.push(year);
        }
      });
      setYears(y);
    }
  }, [data?.routes]);

  React.useEffect(() => {
    const val = [];
    if (data?.routes) {
      let yesterday = selectedYear
        ? DateTime.local(parseInt(selectedYear, 10), 12, 31)
            .startOf("day")
            .toJSDate()
        : DateTime.fromJSDate(new Date()).startOf("day").toJSDate();
      const dates = data.routes.map((r) =>
        DateTime.fromISO(r.start_time, { zone: r.tz })
          .startOf("day")
          .toISODate()
      );
      for (let i = 0; i < 368; i++) {
        const count = dates.filter(
          ((yesterdayString) => {
            return (dayString) => dayString === yesterdayString;
          })(DateTime.fromJSDate(yesterday).toISODate())
        ).length;
        val.push({ date: yesterday, count });
        yesterday = shiftDate(yesterday, -1);
      }
    }
    setCalendarVal(val);
  }, [data?.routes, selectedYear]);

  function shiftDate(date, numDays) {
    const newDate = DateTime.fromJSDate(date);
    return newDate.plus({ days: numDays }).toJSDate();
  }

  const getCountryStats = () => {
    const val = {};
    routes.forEach((r) => {
      if (val[r.country]) {
        val[r.country] += 1;
      } else {
        val[r.country] = 1;
      }
    });
    const res = [];
    for (let [key, value] of Object.entries(val)) {
      res.push({ country: key, count: value });
    }
    return res.sort((a, b) => (a.count < b.count ? 1 : -1));
  };

  if (urls.includes(match.params.username)) {
    return null;
  }

  return (
    <>
      {found && data && (
        <div className="container main-container">
          <Helmet>
            <title>
              {(data.first_name && data.last_name
                ? capitalizeFirstLetter(data.first_name) +
                  " " +
                  capitalizeFirstLetter(data.last_name)
                : data.username) +
                " Maps" +
                (match.params.date
                  ? " on " +
                    DateTime.fromISO(match.params.date, {
                      setZone: false,
                    }).toFormat("DDDD")
                  : match.params.year
                  ? " in " + match.params.year
                  : "") +
                " | Mapdump.com"}
            </title>
          </Helmet>
          <div className="mb-3" style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ marginRight: "15px" }}>
              <img
                src={`${import.meta.env.VITE_AVATAR_ROOT}/athletes/${data.username}.webp`}
                alt="avatar"
                style={{ borderRadius: "50%", border: "1px solid #b6b6b6" }}
                height="75px"
                width="75px"
              ></img>
            </div>
            <div>
              <h2>
                <Link to={`/athletes/${data.username}`}>
                  {data.first_name && data.last_name
                    ? capitalizeFirstLetter(data.first_name) +
                      " " +
                      capitalizeFirstLetter(data.last_name)
                    : data.username}
                </Link>
              </h2>
              <h5>@{data.username}</h5>
            </div>
          </div>
          <h3 data-testid="routeCount">
            {routes.length} Route{routes.length === 1 ? "" : "s"}{" "}{match.params.date ? (
              <>on {DateTime.fromISO(match.params.date, { setZone: false }).toFormat("DDDD")}</>
            ) : match.params.year && (<>in {match.params.year}</>)}{" "}
            {getCountryStats()
            .map((c) => (
              <span key={c.country} title={regionNames.of(c.country)} style={{fontSize: '0.6em'}}>
                <b className="countryFlags">{getFlagEmoji(c.country)}</b>{" "}
                {c.count}
              </span>
            ))
            .reduce((accu, elem, idx) => {
              return accu === null
                ? [elem]
                : [...accu, <span key={`spacer-${idx}`} style={{fontSize: '0.6em'}}> | </span>, elem];
            }, null)}
          </h3>
          <div>
            {years.map((y) => (
              <span key={y}>
                {selectedYear !== y ? (
                  <Link to={`/athletes/${data.username}/${y}`}>{y}</Link>
                ) : (
                  <b>
                    <Link to={`/athletes/${data.username}/${y}`}>{y}</Link>
                  </b>
                )}
                <> </>
              </span>
            ))}
          </div>
          <div
              onMouseEnter={() => showTooltip(true)}
              onMouseLeave={() => {
                showTooltip(false);
                setTimeout(() => showTooltip(true), 50);
              }}>
            <CalendarHeatmap
              startDate={
                selectedYear
                  ? DateTime.local(parseInt(selectedYear, 10), 1, 1)
                      .startOf("day")
                      .toJSDate()
                  : shiftDate(new Date(), -365)
              }
              endDate={
                selectedYear
                  ? DateTime.local(parseInt(selectedYear, 10), 12, 31)
                      .endOf("day")
                      .toJSDate()
                  : new Date()
              }
              values={calendarVal}
              classForValue={(value) => {
                if (!value?.count) {
                  return "color-empty";
                }
                return "color-rasti-1";
              }}
              tooltipDataAttrs={(value) => {
                return {
                  "data-tip":
                    `${DateTime.fromJSDate(value.date)
                      .setLocale("en-US")
                      .toLocaleString(DateTime.DATE_HUGE)} has ${
                      value.count
                    } route` + (value.count !== 1 ? "s" : ""),
                };
              }}
              showWeekdayLabels={true}
              onClick={(v) => {
                if (v.count) {
                  const dateStr = DateTime.fromJSDate(v.date).toFormat(
                    "yyyy-MM-dd"
                  );
                  history.push(`/athletes/${data.username}/${dateStr}`);
                }
              }}
            ></CalendarHeatmap>
            {tooltip && <ReactTooltip effect="solid" />}
          </div>
          <div className="container">
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
                      <div
                          style={{
                            display: "flex",
                            justifyContent: "start",
                          }}
                        >
                          <div
                            style={{
                                gap: "5px",
                                flexFlow: "row wrap",
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
                                  textDecoration: "none",
                                }}
                                to={"/routes/" + r.id}
                                className={"stretched-link"}
                              >
                                <span
                                  title={regionNames.of(r.country)}
                                  className="countryFlags"
                                  style={{ fontSize: "1.2em" }}
                                >
                                  {getFlagEmoji(r.country)}
                                </span>
                                <span className="text-body ml-2">
                                  {r.name}
                                </span>
                              </Link>
                            </b>
                          </div>
                        </div>
                        <div style={{ fontSize: "0.8em" }}>
                            {displayDate(
                              DateTime.fromISO(r.start_time, {
                                zone: r.tz,
                              })
                            )}
                        </div>
                        <div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "start",
                              gap: "5px",
                              flexFlow: "row wrap",
                              fontSize: "0.8em",
                            }}
                          >
                            <div>
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
              ))}
            </div>
          </div>
        </div>
      )}
      {!data && loading && (
        <div style={{ textAlign: "center" }}>
          <h2>
            <i className="fa fa-spinner fa-spin"></i> Loading
          </h2>
        </div>
      )}
      {found === false && <NotFound />}
    </>
  );
};

export default UserView;
