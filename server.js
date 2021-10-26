//used to send http requests
const { defaults, post, put, get } = pkg;
import pkg from 'axios';
import express, { json, response } from 'express';
import fs from 'fs';
import helmet from 'helmet';

const app = express();

//settings for the axios headers, those sould be fine and stay as they are
const DATATYPE = 'application/json';
defaults.headers.post['Content-Type'] = DATATYPE;
defaults.headers.put['Content-Type'] = DATATYPE;

//used to update existing tasks: PUTURL+taskId+"/"
const PUTURL = "https://api.clickup.com/api/v2/task/";

/* ~ Settings and Query Parameters ~ */
    let PORT;
    let SEND;
    let BILLOMATID;
    let URL;
    let CLIENT;
    let QUOTATION;
    let INVOICE;
    let NETTO;
    let ACCOUNT;
    let INVOICEDATE;
    let MWST;
    let BRUTTO;
/* ~ End ~ */

//the main function of the app, this is running the server
main();
async function main(){
    let settings = await loadSettings();
    console.log("Sending is set to: "+SEND);

    app.set("/","html");
    app.use(json());
    app.use(helmet());

    //set the http port and host, the parameters may be configured in the settings.json file
    //I havent testet other ports than localhost yet, this may be changed when its going live
    var listener = app.listen(process.env.PORT || 3000, () => {
        console.log("Listening on Port: "+ listener.address().port);
    });

    app.get("/", function (req, res) {
        res.send("<h1>Hello World 1</h1>")
    })
    
    //this gets called on each post request
    app.post('/json',(req,res)=>{
        console.log(req.body);
        //the token is supposed to be sent with the query parameters to ensure security
        let token = req.query.token;
        BILLOMATID = req.query.b_id;
        console.log(BILLOMATID);
        defaults.headers.post['Authorization'] = token;
        defaults.headers.put['Authorization'] = token;
        defaults.headers.get['Authorization'] = token;
        let jsonFromBillomat = req.body;
        //function to fetch the Billomat via Get request could be added to sync on script execution
        //store the useful data from the Billomat json in a map
        let valueMap = createValueMap(jsonFromBillomat);
        //put the map into it to determine if it is new data or updated data and send the http request 
        determinePostOrPut(valueMap);
        res.json(jsonFromBillomat);
    });
}

//takes a map of values and adds them in a json file for the http request body
//the value map might be swapped
function createJsonForClickUp(valueMap,customFieldIds){
    console.info("Starting to create a new .json file for ClickUp.")
    console.log(customFieldIds.get('netto'));
    let httpRequest = JSON.stringify(
        { 
            //task name
            "name": valueMap.get('name'),
            //task status
            "status":valueMap.get('status'),

            "assignees": [ valueMap.get('assignees') ], 
            //needed -> the custom fields in clickUp work only if this is aviable
            "check_required_custom_fields": true,
            //due date of the task
            "due_date": valueMap.get('due date'),
            //if false no specific time and only the date will be displayed in due date
            //recommended: false
            "due_date_time": false, 
            //custom fields in clickup need to be "declared" in this array
            //the sceme is an id of the field and the value to be assigned
            //multiple custom fields may be added later
            "custom_fields": [ 
                { 
                    "id":customFieldIds.get(CLIENT), 
                    "value":valueMap.get('client')  
                },    
                { 
                    "id":customFieldIds.get(QUOTATION), 
                    "value": valueMap.get('quotation #') 
                },
                { 
                    "id":customFieldIds.get(INVOICE), 
                    "value": valueMap.get('invoice #')
                } ,
                { 
                    "id":customFieldIds.get(NETTO), 
                    "value": valueMap.get('netto')
                }, 
                { 
                    "id":customFieldIds.get(ACCOUNT), 
                    "value": {"add":[ valueMap.get('account') ]}
                }, 
                { 
                    "id":customFieldIds.get(INVOICEDATE), 
                    "value": valueMap.get('invoice date')
                },
                { 
                    "id":customFieldIds.get(MWST), 
                    //calculates 19% of the "netto" price
                    "value":"field(\"netto\")*0.19"
                },
                { 
                    "id":customFieldIds.get(BRUTTO), 
                    //calculates the "brutto" price
                    "value":"field(\"netto\")*1.19"
                }
            ] 
        } 
    );
    console.info("Created a .json file for ClickUp.");
    console.info(httpRequest);
    return httpRequest;
}

//this only exists because click up is not very cool, to add assignees you need to completely change the structure
function createUpdateJsonForClickUp(valueMap,customFieldIds){
    console.info("Starting to create an updated .json file for ClickUp.")
    let httpRequest = JSON.stringify(
        { 
            //task name
            "name": valueMap.get('name'),
            //task status
            "status":valueMap.get('status'),

            "assignees": {"add":[ valueMap.get('assignees') ]}, 
            //needed -> the custom fields in clickUp work only if this is aviable
            "check_required_custom_fields": true,
            //due date of the task
            "due_date": valueMap.get('due date'),
            //if false no specific time and only the date will be displayed in due date
            //recommended: false
            "due_date_time": false, 
            //custom fields in clickup need to be "declared" in this array
            //the sceme is an id of the field and the value to be assigned
            //multiple custom fields may be added later
            "custom_fields": [ 
                { 
                    "id":customFieldIds.get('client'), 
                    "value":valueMap.get('client')  
                },    
                { 
                    "id":customFieldIds.get('quotation #'), 
                    "value": valueMap.get('quotation #') 
                },
                { 
                    "id":customFieldIds.get('invoice #'), 
                    "value": valueMap.get('invoice #')
                } ,
                { 
                    "id":customFieldIds.get('netto'), 
                    "value": valueMap.get('netto')
                }, 
                { 
                    "id":customFieldIds.get('account'), 
                    "value": valueMap.get('account')
                }, 
                { 
                    "id":customFieldIds.get('invoice date'), 
                    "value": valueMap.get('invoice date')
                },
                { 
                    "id":customFieldIds.get('mwst'), 
                    //calculates 19% of the "netto" price
                    "value":"field(\"netto\")*0.19"
                },
                { 
                    "id":customFieldIds.get('brutto'), 
                    //calculates the "brutto" price
                    "value":"field(\"netto\")*1.19"
                }
            ] 
        } 
    );
    console.info("Created a .json file for ClickUp.")
    return httpRequest;
}

//this function is called when billomat sends an update on an invoice
//the output is a value map with the needed information to create a .json for clickup
//since this knows that its extracting infos from an invoice it can fetch infos from billomat to complete missing infos
function extractFromBillomatInvoice(jsonFromBillomat){
    console.info("Extracting data from invoice.json input.")
    //stored in a map for easy access on attributes
    let valueMap = new Map();
    valueMap.set('name',jsonFromBillomat.invoice.label);
    valueMap.set('status',jsonFromBillomat.invoice.status);
    valueMap.set('invoice #',jsonFromBillomat.invoice.invoice_number);
    //needs to be get from billomat to encrypt id
    getOfferFromId(jsonFromBillomat.invoice.offer_id).then(function(results){
        if(results!="not found"){
            valueMap.set('quotation #',results);
        }
    })
    valueMap.set('netto',jsonFromBillomat.invoice.total_net_unreduced);
    //needs to be get from billomat to encrypt id
    getClientFromId(jsonFromBillomat.offer.client_id).then(function(results){
        if(results!="not found"){
            valueMap.set('client',results);
        }
    })
    //need to be saved as Date.getTime() because Billomat only accpts time in millis 
    valueMap.set('due date',Date.parse(jsonFromBillomat.invoice.due_date));
    valueMap.set('invoice date',Date.parse(jsonFromBillomat.invoice.date))

    //sets a default value since the undefined state would be a "400 - Bad Request"
    if(valueMap.get('name')==undefined){
        console.error("No Project Name was found, using default value!")
        valueMap.set('name',"default");
    }

    //for now the assignees cant be set from billomat, maybe this will be added later so for now we will use a tmp person which is hard coded
    /*getAssigneeId("Lucas Reisser").then(function(results){
        if(results!="not found"){
            valueMap.set('account',results);
        }
    })
    getAssigneeId("Lucas Reisser").then(function(results){
        if(results!="not found"){
            valueMap.set('assignees',results);
        }
    })*/
    //this should replace the tmp code to fetch the assignee names from the billomat json
    console.log(jsonFromBillomat.invoice.customfield.account)
    getAssigneeId(jsonFromBillomat.invoice.customfield.account).then(function(results){
        if(results!="not found"){
            valueMap.set('account',results);
        }
    })
    console.log(jsonFromBillomat.invoice.customfield.assignee)
    getAssigneeId(jsonFromBillomat.invoice.customfield.assignee).then(function(results){
        if(results!="not found"){
            valueMap.set('assignees',results);
        }
    })

    console.log(valueMap);

    console.info("Extracting data from invoice.json input completed.")
    return valueMap;
}

//this function is called when billomat sends an update on an offer
//the output is a value map with the needed information to create a .json for clickup
function extractFromBillomatOffer(jsonFromBillomat){
    console.info("Extracting data from offer.json input.")
    //stored in a map for easy access on attributes
    let valueMap = new Map();
    valueMap.set('name',jsonFromBillomat.offer.label);
    valueMap.set('status',jsonFromBillomat.offer.status);
    //needs to be get from billomat to encrypt id
    valueMap.set('quotation #',jsonFromBillomat.offer.offer_number);
    //needs to be get from billomat to encrypt id
    getClientFromId(jsonFromBillomat.offer.client_id).then(function(results){
        if(results!="not found"){
            valueMap.set('client',results);
        }
    })

    valueMap.set('netto',jsonFromBillomat.offer.total_net_unreduced);

    //sets a default value since the undefined state would be a "400 - Bad Request"
    if(valueMap.get('name')==undefined){
        console.error("No Project Name was found, using default value!")
        valueMap.set('name',"default");
    }

    //for now the assignees cant be set from billomat, maybe this will be added later so for now we will use a tmp person which is hard coded
    /*getAssigneeId("Lucas Reisser").then(function(results){
        if(results!="not found"){
            valueMap.set('account',results);
        }
    })
    getAssigneeId("Lucas Reisser").then(function(results){
        if(results!="not found"){
            valueMap.set('assignees',results);
        }
    })*/
    //this should replace the tmp code to fetch the assignee names from the billomat json
    getAssigneeId(jsonFromBillomat.invoice.customfield.account).then(function(results){
        if(results!="not found"){
            valueMap.set('account',results);
        }
    })
    getAssigneeId(jsonFromBillomat.invoice.customfield.assingee).then(function(results){
        if(results!="not found"){
            valueMap.set('assignees',results);
        }
    })

    console.log(valueMap);

    console.info("Extracting data from offer.json input completed.")
    return valueMap;
}

//decides and sends a post or put request via a get request checking if the task is already created or not
//further more does it send the request and call the method to fetch custom field ids
async function determinePostOrPut(valueMap){
    //creates the Json file which is gonna be sent to clickup
    let customFieldIds = await getCustomFieldIds();
    if(customFieldIds==undefined){
        console.error("Error while fetching customFieldIDs, couldnt create a .json for ClickUp!");
    }
    else{
        let task = await checkIfTaskExistsByName(valueMap.get('name'));
        if(task!=undefined){
            console.info("Task was found, updating the existing one.");
            if(SEND){
                sendPutRequest(createUpdateJsonForClickUp(valueMap,customFieldIds),task);
            }
        }
        else{
            console.info("Task wasn't found, creating a new one.");
            if(SEND){
                sendPostRequest(createJsonForClickUp(valueMap,customFieldIds));
            }
       }
    }
}

//sends the http post request via axios to finally add the task to the clickup list :)
function sendPostRequest(toSend){
    post(URL,toSend)
    .then(function (response) {
        console.log("Created a new task with status: "+response.status);
    })
    .catch(function (error) {
        console.log("Error while sending a post request: ",error);
    });
}

//sends the http put request to update an existing task
//taskId is contained in the parameters in order to configure the target link
function sendPutRequest(toSend,task){
    let toSendCustomFields = JSON.parse(toSend).custom_fields;
    let taskCustomFields = task.custom_fields;

    //gets called to update all custom fields since they cant be updated via the standart put request
    syncCustomFields(toSendCustomFields,taskCustomFields,task.id);

    let buildUrl = PUTURL+task.id+"/"
    put(buildUrl,toSend)
    .then(function (response) {
        console.log("Updated an existing task with status: "+response.status);
    })
    .catch(function (error) {
        console.log("Error while sending a put request: ",error);
    });
}

//this takes the "label" from billomat and searches for a task with the same name in click up, this is used to determine if we should send an update or new task
async function checkIfTaskExistsByName(name){
    console.info("Checking if the Task with name '"+name+"' exists.");
    //a Promise was needed to wait for this funtion to return
    return new Promise(resolve=>{
        //array which is returned at the end of the function and contains the wanted information taskAndId[0]=bool taskAndId[1]=taskID
        let taskAndId = [];
        let task;
        //GET request fetching all the Tasks in the defined list
        get(URL)
        .then(function(response){
            let taskFound = false;
            //All the tasks from a list in the array to have a look at their custom fields
            let taskArray = response.data.tasks;
            taskArray.forEach(element => {

                if(element.name == name){
                    taskFound = true;
                    taskAndId.push(taskFound);
                    taskAndId.push(element.id);
                    task = element;
                }
            });
            //if the task wasnt found yet the return array is empty, therefore false needs to added to it
            if(!taskFound){
                taskAndId.push(taskFound);
            }
            console.log('Task found = '+taskAndId[0]+' With ID: '+taskAndId[1]);
            resolve(task);
        })
        .catch(function(error){
            console.log("Error while searching for the Task: ",error);
        });
    });
}

//This updates custom fields since it cant be done with a "normal" PUT request
function syncCustomFields(updatedCustomFields,actualCustomFields,taskId){
    //two for loops compare the IDs of the custom fields to spot differences
        updatedCustomFields.forEach(newElement=>{
            actualCustomFields.forEach(oldElement=>{
                //if the IDs match we can c
                if(newElement.id==oldElement.id){
                    //if the type of the field is a formua it updates the value itself, if the formula is gonna be changed its critical idk 
                    if(oldElement.type!="formula")
                    {
                        let toSend;
                        let send = false;
                        //link for the post request
                        let customFieldURL = "https://api.clickup.com/api/v2/task/"+taskId+"/field/"+newElement.id+"/";
                        //this handy pice of code was added to prevent any errors while doing currency calculations --> all numbers are stored as .xx
                        if(oldElement.type == "currency"){
                            oldElement.value *= 100;
                            newElement.value *= 100;
                            oldElement.value = Math.floor(oldElement.value);
                            newElement.value = Math.floor(newElement.value);
                            oldElement.value /= 100;
                            newElement.value /= 100;
                        }
                        //send post request to the custom field which is gonna be changed
                        //as soon as send = true a value string gets created and is sent at the end of the function all the states of the ifs are exclusive
                        //-> There shouldnt be any overwriting action of toSend
                        if(oldElement.type=="users"){
                            if(oldElement.value!=undefined){
                                if(newElement.value!=oldElement.value[0].id){
                                    send=true;
                                    toSend = "{\"value\"\:{\"add\":["+newElement.value+"]}}";
                                }
                            }
                            else{
                                send = true;
                                toSend = "{\"value\"\:{\"add\":["+newElement.value+"]}}";
                            }
                        }
                        else if(newElement.value!=oldElement.value){
                            send = true;
                            toSend = "{\"value\"\:\""+newElement.value+"\"}";
                        }
                        if(send){
                            //idk why they need a post requset to update a custom value but sure, go for it
                            post(customFieldURL,toSend)
                            .then(function (response) {
                                console.log("updated custom field ("+newElement.id+") using post with status: "+response.status);
                            })
                            .catch(function (error) {
                                console.log("Error while sync Custom Fields: ",error);
                            });
                        }
                    }
                }
            })
        })
    }

//fetches all the customFieldIds and returns them in a map, this way they dont have to be set manually
//async so the programm waits for it to finish
async function getCustomFieldIds(){
    console.info("Get Custom Field IDs started.")
    return new Promise(resolve=>{
        let customFieldIds = new Map;
        //tasks from the list get returned so their custom fields ids can be stored 
        get(URL)
        .then(function(response){
            let customFields = response.data.tasks[0].custom_fields;
            customFields.forEach(element => {
                customFieldIds.set(element.name,element.id);
                console.info("Custom Field ID added: Field = "+element.name+" \/ ID = "+element.id);
            });
            console.info("Get Custom Field IDs completed.");
            console.log(customFieldIds);
            resolve(customFieldIds);
        })
        .catch(function(error){
            console.error("Error while Get Custom Field IDs: ",error);
        });
    });
}


//this function uses the input json to determine the updates type
//it returns the key of the json, at this state it should be "invoice" or "offer"
function analyzeType(jsonFromBillomat){
    for(var key in jsonFromBillomat) {
        return key;
    }
}

//this creates the value map from the json from Billomat inorder to put the values into the ClickUp json
function createValueMap(jsonFromBillomat){
    //simple switch case to determine which method should be called
    switch (analyzeType(jsonFromBillomat)) {
        case "invoice":
            return extractFromBillomatInvoice(jsonFromBillomat);
        case "offer":
            return extractFromBillomatOffer(jsonFromBillomat);
    } 
}

//The following two functions will be introduced as soon as we have a billomat id to put in, it would be smart if we send this id via quary parameters
//Billomat: GET "https://"+BILLOMATID+".billomat.net/api/clients/"+clientId+"\?format=json"
//Find client_number
function getClientFromId(clientId){
    return new Promise((resolve,reject) => {
        if(clientId == undefinded) reject ("");
        let url = "https://"+BILLOMATID+".billomat.net/api/clients/"+clientId+"\?format=json"
        get(url)
        .then(function(response){
            resolve(response.data.client.name);
        });
        reject("not found");
    })
}

//Billomat: GET "https://"+BILLOMATID+".billomat.net/api/offers/"+offerId+"\?format=json"
//Find offer_number
function getOfferFromId(offerId){
    return new Promise((resolve,reject) => {
        if(offerId == undefinded) reject ("No offer yet");
        let url = "https://"+BILLOMATID+".billomat.net/api/offers/"+offerId+"\?format=json"
        let offerNumber;
        get(url)
        .then(function(response){
            resolve(response.data.offer.offer_number);
        });
        reject("not found");
    });
}

//this does a get request on https://api.clickup.com/api/v2/team/2671386/ and filter the incoming response.data.team.members to get assigneeName == user.username
function getAssigneeId(assigneeName){
    return new Promise((resolve,reject) => {
        get("https://api.clickup.com/api/v2/team/2671386/")
        .then(function(response){
            response.data.team.members.forEach(member => {
                if(member.user.username == assigneeName){
                    //resolve(member.user.id);
                    resolve("not found");
                }
            });
            reject("not found");
        })
    })
}

//this function loads the settings from an extra file, this is conveniance for the users
async function loadSettings(){
    return new Promise(resolve => {
        fs.readFile("./settings.json",'utf-8',function(error,data){
            if(error){
                console.log("Error while initiating. Aborting...");
                resolve(undefined);
            }
            if(data){
                console.log("Settings found")
                let settings = JSON.parse(data);
                //sending activated or not
                SEND = settings.send;
                //the target url for the tasks
                URL = "https://api.clickup.com/api/v2/list/"+settings.listID+"/task"
                //custom field names
                CLIENT = settings.client;
                QUOTATION = settings.quotation_number;
                INVOICE = settings.invoice_number;
                NETTO = settings.netto;
                ACCOUNT = settings.account;
                INVOICEDATE = settings.invoice_date;
                MWST = settings.mwst;
                BRUTTO = settings.brutto;
                //server settings
                PORT = settings.port;
                console.log("settings loaded");
                resolve(settings);
            }
        })
    }); 
}