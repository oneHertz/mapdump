import React from "react";
import logo from "../livelox-logo-black.png";
import logo2 from "../gpsseuranta.png";

const INVALID_URL_MSG = "Invalid livelox or gpsseuranta event URL!";
const ERROR_LOADING_MSG = "Error fetching livelox or gpsseuranta event map!";

function LiveloxPicker(props) {
    const [urlError, setUrlError] = React.useState(null);
    const [submitting, setSubmitting] = React.useState(false);

    const onChangeURL = (e) => {
        const url = e.target.value;
        const isValid = /^https:\/\/www\.livelox\.com\/Viewer\/.+\?([^&]+&)?classId=(\d+)(&.+)?$/.test(url) || /^https:\/\/([^.]+\.)?tulospalvelu.fi\/(gps\/)?[^/]+\/$/.test(url);
        if (!isValid) {
            setUrlError(INVALID_URL_MSG);
        } else {
            setUrlError(null);
        }
    }

    const onSubmit = (e) => {
        e.preventDefault();
        window.onbeforeunload = null;
        const formData = new FormData(e.target);
        formData.append('type', 'kmz');
        
        const url = formData.get("url");
        const serviceName = /^https:\/\/www\.livelox\.com\//.test(url) ? "livelox" : "gpsseuranta";

        setSubmitting(true);
        fetch(`https://map-download.routechoices.com/api/get-${serviceName}-map`, {
            method: "POST",
            body: formData,
        }).then((r) => r.blob()).then((blob) => {
            const myFile = new File([blob], "map.kmz", {type: "application/kmz"});
            props.onSubmit([myFile]);
        }).catch(() => {
            setUrlError(ERROR_LOADING_MSG);
        }).finally(() => {
            setSubmitting(false);
        })
    }
    return <div>
        <form onSubmit={onSubmit}>
            <div className="mb-3">
                <label className="form-label"><a href="https://livelox.com" target="_blank" rel="noopener noreferrer"><img alt="livelox" src={logo} height="40"/></a><a className="ml-3" href="https://gps.tulospalvelu.fi" target="_blank" rel="noopener noreferrer"><img style={{verticalAlign: "bottom"}}alt="gpsseuranta" src={logo2} height="30"/></a></label>
                <input className={"form-control" + (!urlError ? "" : " is-invalid")} placeholder="Livelox or GPSSeuranta URL" onChange={onChangeURL} name="url" required={true} autoComplete="off"></input>
                { !!urlError && (<div className="invalid-feedback">
                    {urlError}
                </div>)}
            </div>
            <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? <><i className="fa fa-spinner fa-spin"></i>{" "}</> :  ""}Fetch</button>
        </form>
    </div>
}

export default LiveloxPicker
