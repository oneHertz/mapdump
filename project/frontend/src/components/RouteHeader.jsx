import React, { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { Link } from "react-router-dom";
import Swal from "sweetalert2";
import { DateTime } from "luxon";
import useGlobalState from "../utils/useGlobalState";
import { printTime, printPace } from "../utils/drawHelpers";
import {
  capitalizeFirstLetter,
  displayDate,
  regionNames,
  getFlagEmoji,
} from "../utils";
import { LinkItUrl, LinkIt } from "react-linkify-it";

const hashtagRegex = /(^|\B)#(?![0-9_]+\b)([a-zA-Z0-9_]{1,30})(\b|\r)/;

const RouteHeader = (props) => {
  const [name, setName] = useState();
  const [comment, setComment] = useState();
  const [nameEditing, setNameEditing] = useState(false);
  const [commentEditing, setCommentEditing] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = React.useRef(null);
  const commentInputRef = React.useRef(null);
  const globalState = useGlobalState();
  const { username, api_token } = globalState.user;

  useEffect(() => {
    setName(props.name);
  }, [props.name]);

  useEffect(() => {
    setComment(props.comment);
  }, [props.comment]);

  useEffect(() => {
    setIsPrivate(props.isPrivate);
  }, [props.isPrivate]);

  const enableNameEditing = (ev) => {
    ev.preventDefault();
    if (canEdit()) {
      setNameEditing(true);
    }
  };

  const enableCommentEditing = (ev) => {
    ev.preventDefault();
    if (canEdit()) {
      setCommentEditing(true);
    }
  };

  const togglePrivacy = async (ev) => {
    ev.preventDefault();
    if (canEdit()) {
      await putPrivacy(!isPrivate);
    }
  };

  useEffect(() => {
    if (nameEditing) {
      inputRef.current.focus();
    }
  }, [nameEditing]);

  useEffect(() => {
    if (commentEditing) {
      commentInputRef.current.focus();
    }
  }, [commentEditing]);

  const saveName = async (e) => {
    setNameEditing(false);
    if (e.target.value !== name) {
      await putName(e.target.value);
    }
  };

  const saveComment = async (e) => {
    setCommentEditing(false);
    if (e.target.value !== name) {
      await putComment(e.target.value);
    }
  };

  const putName = async (newName) => {
    if (saving || !username) {
      return;
    }
    setName(newName);
    const tkn = api_token;
    setSaving(true);
    try {
      const response = await fetch(
        import.meta.env.VITE_API_URL + "/v1/route/" + props.id,
        {
          method: "PATCH",
          credentials: "omit",
          headers: {
            Authorization: "Token " + tkn,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: newName }),
        }
      );
      setSaving(false);
      if (response.status !== 200) {
        Swal.fire({
          title: "Error!",
          text: "Something went wrong!",
          icon: "error",
          confirmButtonText: "OK",
        });
      }
      props.onNameChanged && props.onNameChanged(newName);
    } catch (e) {}
  };
  const putPrivacy = async (newPrivacy) => {
    if (saving) {
      return;
    }
    setIsPrivate(newPrivacy);
    const tkn = api_token;
    setSaving(true);
    try {
      const response = await fetch(
        import.meta.env.VITE_API_URL + "/v1/route/" + props.id,
        {
          method: "PATCH",
          credentials: "omit",
          headers: {
            Authorization: "Token " + tkn,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ is_private: newPrivacy }),
        }
      );
      setSaving(false);
      if (response.status !== 200) {
        Swal.fire({
          title: "Error!",
          text: "Something went wrong!",
          icon: "error",
          confirmButtonText: "OK",
        });
      }
      props.onPrivacyChanged && props.onPrivacyChanged(newPrivacy);
    } catch (e) {}
  };
  const putComment = async (newComment) => {
    if (saving || !username) {
      return;
    }
    setComment(newComment);
    const tkn = api_token;
    setSaving(true);
    try {
      const response = await fetch(
        import.meta.env.VITE_API_URL + "/v1/route/" + props.id,
        {
          method: "PATCH",
          credentials: "omit",
          headers: {
            Authorization: "Token " + tkn,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ comment: newComment }),
        }
      );
      setSaving(false);
      if (response.status !== 200) {
        Swal.fire({
          title: "Error!",
          text: "Something went wrong!",
          icon: "error",
          confirmButtonText: "OK",
        });
      }
    } catch (e) {}
  };

  const canEdit = () => {
    return username === props.athlete.username;
  };

  const deleteMap = async (e) => {
    e.preventDefault();
    const { isConfirmed } = await Swal.fire({
      title: "Confirm",
      icon: "warning",
      text: "Are you sure you want to delete this activity?",
      showCancelButton: true,
      confirmButtonText: "Delete",
    });
    if (isConfirmed) {
      await fetch(import.meta.env.VITE_API_URL + "/v1/route/" + props.id, {
        method: "DELETE",
        credentials: "omit",
        headers: {
          Authorization: "Token " + api_token,
          "Content-Type": "application/json",
        },
      });
      // remove strava link
      props.history.push("/");
    }
  };

  const mapCenterCoords = function () {
    return [
      Math.round(
        ((props.mapCornersCoords.top_left.lat +
          props.mapCornersCoords.bottom_right.lat +
          props.mapCornersCoords.bottom_left.lat +
          props.mapCornersCoords.top_right.lat) /
          4) *
          100000
      ) / 100000,
      Math.round(
        ((props.mapCornersCoords.top_left.lng +
          props.mapCornersCoords.bottom_right.lng +
          props.mapCornersCoords.bottom_left.lng +
          props.mapCornersCoords.top_right.lng) /
          4) *
          100000
      ) / 100000,
    ];
  };

  return (
    <div>
      <Helmet>
        <title>
          {props.name +
            " by " +
            (props.athlete.first_name && props.athlete.last_name
              ? capitalizeFirstLetter(props.athlete.first_name) +
                " " +
                capitalizeFirstLetter(props.athlete.last_name)
              : props.athlete.username) +
            " | Mapdump.com"}{" "}
        </title>
      </Helmet>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "start",
            width: "calc(100% - 50px)",
          }}
        >
          <div style={{ marginRight: "10px", textAlign: "center" }}>
            <img
              src={
                import.meta.env.VITE_AVATAR_ROOT +
                "/athletes/" +
                props.athlete.username +
                ".png"
              }
              alt="profile"
              style={{ borderRadius: "50%", width: "80px" }}
            ></img>
            <br />
            <span
              title={regionNames.of(props.country)}
              className={"fa-2x countryFlags"}
              style={{ marginTop: "15px" }}
            >
              {getFlagEmoji(props.country)}
            </span>
          </div>
          <div style={{ borderLeft: "1px solid #B4B4B4", width: "100%" }}>
            <h2>
              <div style={{ paddingLeft: "5px" }}>
                <Link to={"/athletes/" + props.athlete.username}>
                  {props.athlete.first_name && props.athlete.last_name
                    ? capitalizeFirstLetter(props.athlete.first_name) +
                      " " +
                      capitalizeFirstLetter(props.athlete.last_name)
                    : props.athlete.username}
                </Link>
                <div style={{ marginTop: "-10px" }}>
                  <small style={{ fontSize: "0.5em" }}>
                    {displayDate(
                      DateTime.fromISO(props.startTime, { zone: props.tz })
                    )}
                  </small>
                </div>
                {(!canEdit() || !nameEditing) && <>{name}</>}
                {canEdit() && nameEditing && (
                  <input
                    style={{ width: "100%" }}
                    ref={inputRef}
                    type="text"
                    maxLength={52}
                    defaultValue={name}
                    onBlur={saveName}
                    data-testid="editNameInput"
                  />
                )}
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
                    <span style={{ color: "#666" }}>Distance</span>
                    <br />
                    {(props.distance / 1000).toFixed(1) + "km"}
                  </div>
                  {props.duration ? (
                    <>
                      <div
                        style={{
                          borderLeft: "1px solid #B4B4B4",
                          paddingLeft: "5px",
                        }}
                      >
                        <span style={{ color: "#666" }}>Duration</span>
                        <br />
                        {printTime(props.duration * 1000)}
                      </div>
                      <div
                        style={{
                          borderLeft: "1px solid #B4B4B4",
                          paddingLeft: "5px",
                        }}
                      >
                        <span style={{ color: "#666" }}>Pace</span>
                        <br />
                        {printPace((props.duration / props.distance) * 1000)}
                      </div>
                    </>
                  ) : (
                    ""
                  )}
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    gap: "5px",
                    paddingLeft: "5px",
                    paddingTop: "10px",
                  }}
                >
                  <a
                    href={
                      `https://map.routechoices.com/?latlon=${mapCenterCoords()[0]},${mapCenterCoords()[1]}`
                    }
                    className="btn btn-sm btn-info text-nowrap"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <i className="fa fa-map-marked-alt"></i>{" "}
                    {mapCenterCoords()[0]}, {mapCenterCoords()[1]}
                  </a>
                </div>
              </div>
            </h2>
          </div>
        </div>
        {canEdit() && (
          <div>
            <button
              type="button"
              className="btn btn-light"
              data-toggle="dropdown"
              aria-haspopup="true"
              aria-expanded="false"
              data-testid="actionMenuBtn"
            >
              <i className="fas fa-ellipsis-h"></i>
            </button>
            <div className="dropdown-menu dropdown-menu-right">
              <a
                className={"dropdown-item" + (nameEditing ? " disabled" : "")}
                href="/#"
                onClick={enableNameEditing}
                data-testid="editNameBtn"
              >
                <i className="fa fa-pen"></i> Edit title
              </a>
              <a
                className={
                  "dropdown-item" + (commentEditing ? " disabled" : "")
                }
                href="/#"
                onClick={enableCommentEditing}
              >
                <i className="fa fa-pen"></i> Edit description
              </a>
              <a
                className={"dropdown-item"}
                href="/#"
                onClick={togglePrivacy}
                data-testid="togglePrivacyBtn"
              >
                <i className="fa fa-lock"></i>{" "}
                {isPrivate ? "Make Public" : "Make Private"}
              </a>
              <div className="dropdown-divider"></div>
              <a className="dropdown-item" href="/#" onClick={deleteMap}>
                <i className="fa fa-trash"></i> Delete
              </a>
            </div>
          </div>
        )}
      </div>
      <div style={{ margin: "15px 0" }}>
        {(!canEdit() || !commentEditing) && (
          <blockquote style={{ whiteSpace: "pre-wrap", lineBreak: "anywhere" }}>
            <p>
              <LinkItUrl>
                <LinkIt
                  regex={hashtagRegex}
                  component={(match, key) => (
                    <a href={"/routes/tag/" + match.slice(1)} key={key}>
                      {match}
                    </a>
                  )}
                >
                  {comment}
                </LinkIt>
              </LinkItUrl>
            </p>
          </blockquote>
        )}
        {canEdit() && commentEditing && (
          <div className="grow-wrap" data-replicated-value={comment}>
            <textarea
              className="form-control"
              ref={commentInputRef}
              defaultValue={comment}
              onBlur={saveComment}
              onInput={(e) =>
                (e.target.parentNode.dataset.replicatedValue = e.target.value)
              }
              col={40}
              row={10}
            ></textarea>
          </div>
        )}
      </div>
    </div>
  );
};

export default RouteHeader;
