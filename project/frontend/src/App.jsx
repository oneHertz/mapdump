import React , { Suspense } from "react";
import { BrowserRouter as Router, Route, Switch, Link } from "react-router-dom";
import RasterMapRedirect from "./components/RasterMapRedirect";
import LoginPage from "./components/LoginPage";
import LoginAsPage from "./components/LoginAsPage";
import NotFound from "./components/NotFound";
import TOS from "./components/TOS";
import PrivacyPolicy from "./components/PrivacyPolicy";
import Register from "./components/Register";
import VerifyEmail from "./components/VerifyEmail";
import PasswordReset from "./components/PasswordReset";
import Settings from "./components/Settings";
import BrowseMap from "./components/BrowseMap";
import RoutesForTag from "./components/RoutesForTag";
import PasswordResetConfirmation from "./components/PasswordResetConfirmation";
import UserDeletionConfirmation from "./components/UserDeletionConfirmation";
import { GlobalStateProvider } from "./utils/useGlobalState";

window.drawmyroute = {};

const LazyHome = React.lazy(() => import('./components/Home'));
function Home(props) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LazyHome {...props} />
    </Suspense>
  );
}

const LazyUserView = React.lazy(() => import('./components/UserView'));
function UserView(props) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LazyUserView {...props} />
    </Suspense>
  );
}

const LazyRasterMap = React.lazy(() => import('./components/RasterMap'));
function RasterMap(props) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LazyRasterMap {...props} />
    </Suspense>
  );
}

const LazyNewMap = React.lazy(() => import('./components/NewMap'));
function NewMap(props) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LazyNewMap {...props} />
    </Suspense>
  );
}

function App() {
  const onClickHome = (e) => {
    if (window.location.pathname === "/") {
      e.preventDefault();
      window.location.reload();
    }
  };

  React.useEffect(() => {
    window.addEventListener('beforeunload', function (event) {
      event.stopImmediatePropagation();
      return null;
    });
    window.beforeunload = null;
  }, [window.beforeunload])

  return (
    <GlobalStateProvider>
      <Router basename="/">
        <div className="jumbotron text-end mb-5">
          <div
            style={{
              width: "100%",
              height: "100%",
              backgroundColor: "#33333366",
              position: "absolute",
              top: "0",
              left: "0",
              zIndex: -1,
            }}
          ></div>
          <Link
            to="/"
            onClick={onClickHome}
            style={{
              textDecoration: "none",
              color: "#f3f9",
              fontWeight: "bold",
            }}
          >
            <h1 style={{ whiteSpace: "nowrap", fontSize: "9vw", fontWeight: "bold", }}>
              MAPDUMP
            </h1>
            <p style={{ whiteSpace: "nowrap", margin: "0 0 0 0", fontSize: "4vw", fontWeight: "bold", }}>
              WHERE YOUR MAPS END THEIR LIFE...
            </p>
          </Link>
        </div>
        <Route path="/" />
        <Switch>
          <Route exact path="/" component={Home} />
          <Route exact path="/routes/tag/:tag" component={RoutesForTag} />
          <Route exact path="/new" component={NewMap} />
          <Route exact path="/map" component={BrowseMap} />
          <Route exact path="/tos" component={TOS} />
          <Route exact path="/privacy-policy" component={PrivacyPolicy} />
          <Route exact path="/login" component={LoginPage} />
          <Route exact path="/login-as" component={LoginAsPage} />
          <Route exact path="/sign-up" component={Register} />
          <Route exact path="/settings" component={Settings} />
          <Route exact path="/password-reset" component={PasswordReset} />
          <Route
            exact
            path="/password-reset-confirmation/:key"
            component={PasswordResetConfirmation}
          />
          <Route
            exact
            path="/account-deletion-confirmation/:key"
            component={UserDeletionConfirmation}
          />
          <Route exact path="/verify-email/" component={VerifyEmail} />
          <Route exact path="/verify-email/:key" component={VerifyEmail} />
          <Route exact path="/routes/:uid/" component={RasterMap} />
          <Route
            exact
            path="/routes/:uid/player"
            component={RasterMapRedirect}
          />
          <Route exact path="/athletes/:username" component={UserView} />
          <Route
            exact
            path="/athletes/:username/:date(\d{4}-\d{2}-\d{2})"
            component={UserView}
          />
          <Route
            exact
            path="/athletes/:username/:year(\d{4})"
            component={UserView}
          />
          <Route exact path="*" component={NotFound} />
        </Switch>
        <footer className="container-fluid text-center">
          <span>
            &copy;2019-{new Date().getFullYear()}&nbsp;Mapdump.com -{" "}
            <a href="mailto:info@mapdump.com">Contact</a> -{" "}
            <Link to="/privacy-policy">Privacy Policy</Link> -{" "}
            <Link to="/tos">Terms of Service</Link>
          </span>
          <br />
          <img
            alt="Compatible with strava"
            width="200px"
            src="/static/compatibleWithStrava.webp"
          ></img>
        </footer>
      </Router>
    </GlobalStateProvider>
  );
}

export default App;
