const jwt = require("jsonwebtoken");

const token = (id)=>{
    return jwt.sign({ id}, process.env.SECRET_KEY,{ expiresIn: "3d"});
}


module.exports = {
    token
}