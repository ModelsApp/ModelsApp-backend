var db = require('./connection');
var bcrypt = require('bcrypt-nodejs');
var entityHelper = require('../lib/entityHelper');
var token = require('../config/generateToken');
var crypto = require('crypto');
var sendGrid = require('../lib/sendGrid');

var User;
db.getInstance(function(p_db) {
  User = p_db.collection('users');
});
var exports = module.exports = {};

exports.createUser = async (req, res, next) => {
    var email = req.body.email;
    var password = req.body.password;
    var confirmPassword = req.body.confirmPassword;
    const emailRegexp = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    
    if(email && emailRegexp.test(email) && password && confirmPassword && password == confirmPassword){
        email = email.toLowerCase();
        var user = await User.findOne({ email:  email});
        if(!user){
            var newUser = {
                _id : await entityHelper.getNewId('userid'),
                email : email,
                password : bcrypt.hashSync(password, bcrypt.genSaltSync(8), null),
                photo: null,
                accepted : false,
                newUser : true,
                referralCode : crypto.randomBytes(2).toString('hex'),
                referredFrom : null,
                credits : 200,
                devices : [],
                plan : {},
                isAcceptationPending : true,
                isEmailAcceptationPending : true,
                temporaryPassword : null,
                loginTypes : [],
                confirmHash : crypto.randomBytes(10).toString('hex'),
                images: [],
                mainImage: null,
                isPaymentRequired: false
            };

            newUser.loginTypes.push('email');
            User.insertOne( newUser, async function(err, user) {
                if (err) {
                    return res.status(400).json({message :  err });
                }else{  
                    await sendGrid.sendConfirmAccountEmail(newUser, req);
                    return res.status(200).json({ 
                        isChangePasswordRequired: Boolean(newUser.temporaryPassword && bcrypt.compareSync(password, newUser.temporaryPassword)),
                        token : token.generateAccessToken(newUser._id)
                    });
                }
                });
        }else {
            // should we defined extra logic here to handle users that loged into application before with instagram
            // lets check that user has sing in into application before with instagram
            if(user.loginTypes && user.loginTypes.filter(login => login == 'instagram').length > 0 && user.loginTypes.filter(login => login == 'email').length == 0){
                var instagramUsername = req.body.username;
                // first time requestTriggered
                if(!instagramUsername){
                    return res.status(404).json({message : "There is an user with same email connected with instagram. Provide your instagram username to connect accounts" });
                }else{
                    if(user.instagram.username == instagramUsername){
                        User.findOneAndUpdate({ _id: user._id }, 
                            { $set: { password: bcrypt.hashSync(password, bcrypt.genSaltSync(8), null) } ,
                              $push: { loginTypes: 'email' }
                            })
                                .then((user) => {
                                    return res.status(200).json({ token : token.generateAccessToken(user.value._id)});
                                });
                                
                    }else{
                        return res.status(400).json({message : "instagram username is not match" });
                    }
                }
            }else{
                return res.status(400).json({message : "user arleady exist" });
            }
        }
    }else{
        return res.status(400).json({message : "invalid parameters" });
    }
};

exports.loginUser = async (req, res, next) => {
    var email = req.body.email;
    var password = req.body.password;
    const emailRegexp = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    if(email && emailRegexp.test(email) &&  password){
        email = email.toLowerCase();
        var user = await User.findOne({ email:  email});
        if(user){
            var isTempPassword = Boolean(user.temporaryPassword && bcrypt.compareSync(password, user.temporaryPassword)); //user has temporary password so he forgot his current one
            if(user && user.password && (bcrypt.compareSync(password, user.password) 
                || isTempPassword )){ 
                return res.status(200).json({ 
                    isChangePasswordRequired: isTempPassword,
                    token : token.generateAccessToken(user._id)
                });
            }else{
                return res.status(400).json({message : "invalid email or password" });
            }
        }else{
            return res.status(400).json({message : "invalid email or password" });
        }
        
    }else{
        return res.status(400).json({message : "invalid parameters" });
    }
}


