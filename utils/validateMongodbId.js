const mongoose =require('mongoose');


const validateMongoDbId = (id) => {
    if (!mongoose.isValidObjectId(id)) {
        throw new Error("This Id is not valid or found");
    }
};

module.exports = {validateMongoDbId};