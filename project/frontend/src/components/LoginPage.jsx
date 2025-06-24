import React, { useState } from "react";
import { Link } from "react-router-dom";
import useGlobalState from "../utils/useGlobalState";
import { Helmet } from "react-helmet";

const LoginPage = (props) => {
  const globalState = useGlobalState();
  const { username } = globalState.user;
  const [login, setLogin] = useState(false);
  const [pass, setPass] = useState(false);
  const [errors, setErrors] = React.useState({});

  React.useEffect(() => {
    if (username) {
      props.history.push("/");
    }
  }, [username, props]);

  const onLogin = async (e) => {
    e.preventDefault();
    const res = await fetch(import.meta.env.VITE_API_URL + "/v1/auth/login", {
      method: "POST",
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username: login, password: pass }),
    });
    if (res.status === 400) {
      const data = await res.json();
      setErrors(data);
    } else {
      const json = await res.json();
      globalState.setUser({ username: json.username, api_token: json.token });
    }
  };

  return (
    <div className="container main-container">
      <Helmet>
        <title>Login | Mapdump.com</title>
      </Helmet>
      <>
        <h1>
          <i className="fas fa-sign-in-alt"></i> Login
        </h1>
        <hr />
        {errors.non_field_errors &&
          errors.non_field_errors.map((e) => (
            <div
              className="alert alert-danger"
              role="alert"
              dangerouslySetInnerHTML={{ __html: e }}
            ></div>
          ))}
        <form onSubmit={onLogin}>
          <div className="form-group">
            <label htmlFor="username">
              <i className="fas fa-user"></i> Username or Email
            </label>
            <input
              onChange={(e) => {
                setLogin(e.target.value);
              }}
              type="text"
              className="form-control"
              id="username"
              name="username"
              placeholder="Username"
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">
              <i className="fas fa-key"></i> Password
            </label>
            <input
              onChange={(e) => {
                setPass(e.target.value);
              }}
              type="password"
              className="form-control"
              id="password"
              name="password"
              placeholder="Password"
            />
          </div>
          <button
            data-testid="submitLoginBtn"
            type="submit"
            className="btn btn-primary btn-block"
          >
            <i className="fas fa-sign-in-alt"></i> Login
          </button>
        </form>
      </>
      <div style={{ display: "block", justifyContent: "initial" }}>
        <div className="float-right">
          <p>
            Not a member? <Link to="/sign-up">Sign Up</Link>
            <br />
            <Link to="/password-reset">Forgot Password?</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
