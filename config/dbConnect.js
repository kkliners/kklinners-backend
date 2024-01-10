const mongoose=require('mongoose')
const DbString = process.env.MONGO_URL

const dbConnect = async () =>{
    try{
        await mongoose.connect(DbString, {
            useNewUrlParser: true,
            useUnifiedTopology: true, 
        })
        console.log('Trying To connect to her heart')
    }catch(err){
        console.log(err)
        process.exit(1) //once it don't connect to db then it stops the code
    }
}

  module.exports = dbConnect