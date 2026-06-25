import React from "react";
import LatestRoutes from "./LatestRoutes";
import LatestLikes from "./LatestLikes";
import { Helmet } from "react-helmet";

import { Link } from "react-router-dom";
import useGlobalState from "../utils/useGlobalState";
import useUser from "../utils/useUser";
import { capitalizeFirstLetter } from "../utils";

const Home = ({ history }) => {
  const globalState = useGlobalState();
  const userData = useUser();
  const { username } = globalState.user;

  return (
    <>
      <Helmet>
        <title>MAPDUMP</title>
      </Helmet>
      <div className="container" style={{ textAlign: "center" }}>
        {username && userData && (
          <div
            className="col-12 col-md-6 offset-md-3"
            style={{ marginBottom: "15px", zIndex: 100 }}
          >
            <div style={{ textAlign: "center" }}>
              <div style={{ textAlign: "center" }}>
                <img
                  src={
                    import.meta.env.VITE_AVATAR_ROOT +
                    "/athletes/" +
                    username +
                    ".webp"
                  }
                  alt="profile"
                  style={{ borderRadius: "50%", width: "80px", border: "1px solid #b6b6b6" }}
                ></img>
              </div>
              <Link
                to={"/athletes/" + username}
                style={{
                  color: "black",
                  fontSize: "1.7em",
                  fontWeight: "bold",
                }}
              >
                {userData.first_name && userData.last_name
                  ? capitalizeFirstLetter(userData.first_name) +
                    " " +
                    capitalizeFirstLetter(userData.last_name)
                  : userData.username}
              </Link>
            </div>
            <div>
              <Link to="/new">New Map</Link> -{" "}
              <Link to={"/athletes/" + username}>Your Activities</Link> -{" "}
              <Link to="/settings">Settings</Link>
              <LatestLikes history={history}/>
            </div>
            <hr />
          </div>
        )}
        {!username && (
          <div
            className="col-12 text-center"
            style={{ marginBottom: "15px" }}
          >
            <div style={{
                whiteSpace: "nowrap", 
                textAlign: "center",
                fontSize: "1.7em",
                fontWeight: "bold",
              }}>
              <Link to={"/sign-up"}>
                <button type="button" className="btn btn-primary btn-success">Sign Up</button>
              </Link>
              <span style={{ fontSize: ".7em", fontWeight: "normal" }}>
                {" "}
                or <Link to={"/login"}>Login</Link>
              </span>
            </div>
            <hr />
            <div>
              <Link to="/new">Test without Registering</Link>
            </div>
          </div>
        )}
      </div>
      {username && (
      <div className="container main-container">
        <LatestRoutes />
      </div>
      )}
    </>
  );
};

export default Home;
