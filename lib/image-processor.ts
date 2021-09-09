import MongoInterface from "./mongo-interface";

import Web3 from 'web3'

const fs = require('fs');
const path = require('path');
const axios = require('axios');

import Jimp = require('jimp');
 

const web3config = require('../config/web3config')
const TellerOptionsABI = require('../abi/TellerOptionsABI')
const ERC721ABI = require('../abi/ERC721ABI')

const web3 = new Web3(web3config.web3provider)


var mongoInterface:MongoInterface;
var optionIndexToRead = 0;   


export default class ImageProcessor{

    constructor(mInterface:MongoInterface){
        mongoInterface = mInterface;
        
    }

    
    async init(){
        
        setInterval( this.run.bind(this) , 8000 );
    }


    async run(){
        
        const STALE_TIME =  3600*1000 //one hour 

        
        let optionsWithoutRecentImages = await mongoInterface.findManyOptions( { $and:[ { nftContractAddress: { $exists: true }  } ,{$or:[{imageUpdateAttemptedAt: null},{imageUpdateAttemptedAt: { $lte: Date.now()-STALE_TIME }}]} ]  } )
        //console.log('options without recent', optionsWithoutRecentImages)


        if(optionsWithoutRecentImages[optionIndexToRead] === 'undefined'){
            optionIndexToRead = 0
            return 
        }

        let optionData = optionsWithoutRecentImages[optionIndexToRead] // await mongoInterface.findOption( {optionId: optionIndexToRead} )

        



        if(optionData){

            let optionId = optionData.optionId
           
            try{
                let NFTContract = new web3.eth.Contract(ERC721ABI, optionData.nftContractAddress )
                let tokenURI = await NFTContract.methods.tokenURI( optionData.nftTokenId ).call()
                
                console.log(tokenURI)


    
                let filePath = path.resolve(__dirname,  '../tokenassets',optionId.toString().concat('.json'))
                
                await mongoInterface.updateOption( {optionId: optionData.optionId}, {imageUpdateAttemptedAt: Date.now()} )

            
                //add tokenURI to the option record in mongo 
                await this.downloadAsset(tokenURI, filePath   )

                let metadataFile =fs.readFileSync(filePath);
                let metadataParsed = JSON.parse(metadataFile);

                let imagePath =  path.resolve(__dirname,  '../tokenassets',optionId.toString().concat('.jpg'))
                await this.downloadAsset(metadataParsed.image, imagePath   )

                let assetName = metadataParsed.name

                const font = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);


                let tellerBorderImagePath = path.resolve(__dirname,  '../tellerassets', 'TellerOptionsOverlay'.concat('.png'))

                await Jimp.read(tellerBorderImagePath)
                    .then(tellerBorder => {
                        Jimp.read(imagePath)
                        .then(image => {
                            let formattedImagePath = path.resolve(__dirname,  '../formattedimages',optionId.toString().concat('.jpg'))
    
                            return image
                            
                            .contain(512, 512, Jimp.HORIZONTAL_ALIGN_CENTER | Jimp.VERTICAL_ALIGN_MIDDLE)
                           
                            .composite( tellerBorder,0,0)   
                            
                            .print(font, 250, 460,   assetName.substring(0,26))

                            .write(formattedImagePath); // save
                        })
                        .catch(err => {
                            console.error(err);
                        });

                    }) .catch(err => {
                        console.error(err);
                    });

               await mongoInterface.updateOption( {optionId: optionData.optionId}, {imageLastUpdatedAt: Date.now()} )


            }catch(e){
                console.error(e)
            } 
        
        }

        
        optionIndexToRead+=1;
        if(optionIndexToRead >= optionsWithoutRecentImages.length){
            optionIndexToRead = 0
        } 
       


    }

    async downloadAsset(url:string,image_path:string):Promise<any> {

        if(url.startsWith('ipfs://')){

            url = url.replace('ipfs://','https://gateway.pinata.cloud/ipfs/')
            
        }


       //  const path = path.resolve(__dirname, 'images', 'code.jpg')
        const writer = fs.createWriteStream(image_path)
      
        const response = await axios({
          url,
          method: 'GET',
          responseType: 'stream'
        })
      
        response.data.pipe(writer)
      
        return new Promise((resolve, reject) => {
          writer.on('finish', resolve)
          writer.on('error', reject)
        })


    }

   


}