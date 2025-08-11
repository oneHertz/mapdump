import React from "react";
import AvatarUploader from "react-avatar-uploader";
import Swal from "sweetalert2";
import useGlobalState from "../utils/useGlobalState";

import defaultAvatar from "../default-avatar.png";

const Avatar = () => {
  const globalState = useGlobalState();
  const { username: _username, api_token } = globalState.user;

  const [changed, setChanged] = React.useState();
  const [avatar, setAvatar] = React.useState();
  const [errors, setErrors] = React.useState({});
  const [defaultImage, setDefaultImage] = React.useState(`${import.meta.env.VITE_AVATAR_ROOT}/athletes/${_username}.png`);

  const inputRef = React.useRef(null);

  function crop(url, aspectRatio) {
    // we return a Promise that gets resolved with our canvas element
    return new Promise((resolve) => {
      // this image will hold our source image data
      const inputImage = new Image();
      // we want to wait for our image to load
      inputImage.onload = () => {
        // let's store the width and height of our image
        const inputWidth = inputImage.naturalWidth;
        const inputHeight = inputImage.naturalHeight;

        // get the aspect ratio of the input image
        const inputImageAspectRatio = inputWidth / inputHeight;

        // if it's bigger than our target aspect ratio
        let outputWidth = inputWidth;
        let outputHeight = inputHeight;
        if (inputImageAspectRatio > aspectRatio) {
          outputWidth = inputHeight * aspectRatio;
        } else if (inputImageAspectRatio < aspectRatio) {
          outputHeight = inputWidth / aspectRatio;
        }

        // calculate the position to draw the image at
        const outputX = (outputWidth - inputWidth) * 0.5;
        const outputY = (outputHeight - inputHeight) * 0.5;

        // create a canvas that will present the output image
        const outputImage = document.createElement("canvas");

        // set it to the same size as the image
        outputImage.width = outputWidth;
        outputImage.height = outputHeight;

        // draw our image at position 0, 0 on the canvas
        const ctx = outputImage.getContext("2d");
        ctx.drawImage(inputImage, outputX, outputY);
        resolve(outputImage);
      };

      // start loading our image
      inputImage.src = url;
    });
  }

  const onAvatar = async (e) => {
    var reader = new FileReader();
    reader.onload = async function (e) {
      const newAvatar = await crop(e.target.result, 1);
      if (newAvatar.width >= 150) {
        const avatarB64 = newAvatar.toDataURL("image/png");
        setAvatar(avatarB64);
      } else {
        Swal.fire({
          title: "Error!",
          text: "Image is too small!",
          icon: "error",
          confirmButtonText: "OK",
        });
      }
    };
    reader.readAsDataURL(e.target.files[0]);
  };

  const onSubmit = async (e) => {
    setChanged(false);
    setErrors({});

    e.preventDefault();
    const postData = { avatar_base64: avatar };
    const res = await fetch(
      import.meta.env.VITE_API_URL + "/v1/auth/user/settings/",
      {
        method: "PATCH",
        credentials: "omit",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Token " + api_token,
        },
        body: JSON.stringify(postData),
      }
    );
    if (res.status === 400) {
      const data = await res.json();
      setErrors(data);
    } else if (res.status === 200) {
      setChanged(true);
    }
  };

  return (
    <div>
      {
        <>
          {changed && (
            <div className="alert alert-success" role="alert">
              Success! We saved your changes
            </div>
          )}
          {errors.non_field_errors &&
            errors.non_field_errors.map((e) => (
              <div className="alert alert-danger" role="alert">
                {e}
              </div>
            ))}
          <form onSubmit={onSubmit}>
            <div className={"form-group"}>
              <label>
                <i className="fas fa-user"></i> Profile Picture
              </label>
              <AvatarUploader
                onImageChange={onAvatar}
                size={150}
                defaultImg={defaultImage}
                currentImage={avatar}
                fileType={"image/*"}
                ref={inputRef}
              ></AvatarUploader>
            </div>
            <button
              type="submit"
              className="btn btn-primary mr-2"
            >
              <i className="fas fa-save"></i> Save
            </button>
            <button className="btn btn-danger btn-sm" type="button" onClick={() => {
                setAvatar("");
                inputRef.current.currentImage = null;
                setDefaultImage(defaultAvatar)
            }}><i className="fa-solid fa-trash" /> Clear</button>

          </form>
        </>
      }
    </div>
  );
};

export default Avatar;
