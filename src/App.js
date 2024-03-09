//import logo from './logo.svg';
//import './App.css';
import { useState, useCallback, useEffect, useLayoutEffect } from 'react';
import CryptoJS from 'crypto-js';
import axios from 'axios';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Snackbar from '@mui/material/Snackbar';
import { CircularProgress } from '@mui/material';
import { DataGrid, useGridApiRef } from '@mui/x-data-grid';

function App() {
  const apiRef = useGridApiRef();
  const salt = 'tB87#kPtkxqOS2';

  // State Variable - the player list is persisted to local storage
  const [fid, setFid] = useState('');
  const [cdk, setCdk] = useState('');
  const [players, setPlayers] = useState(localStorage.getItem('players') ? JSON.parse(localStorage.getItem('players')) : []);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState();
  const [initialState, setInitialState] = useState();

  // Column definitions for the Data Grid
  const columns = [
    { field: 'fid', headerName: 'Player ID' },
    { field: 'kid', headerName: 'State' },
    { field: 'name', headerName: 'Name', width: 300 },
    { field: 'avatar_image', headerName: 'Avatar' , renderCell: (params) => <img src={params.value} alt="players avatar" /> },
    { field: 'redemption_status', headerName: 'Redemption Status', width: 500 }
  ];

  // beforeUnload event listener to save the dataGridState to local storage
  const saveSnapshot = useCallback(() => {
    if(apiRef?.current?.exportState && localStorage) {
      const currentState = apiRef.current.exportState();
      localStorage.setItem('dataGridState', JSON.stringify(currentState));
    }
  }, [apiRef]);

  // Layout Effect Hook to set the Initial State of the dataGrid before rendering, and install the saveSnappshot even listener
  useLayoutEffect(() => {
    const stateFromLocalStorage = localStorage?.getItem('dataGridState');
    setInitialState(stateFromLocalStorage ? JSON.parse(stateFromLocalStorage) : {});

    window.addEventListener('beforeunload', saveSnapshot);

    return() => {
      window.removeEventListener('beforeunload', saveSnapshot);
      saveSnapshot();
    }
  }, [saveSnapshot]);

  // Effect Hook to store the current list of players in local storage
  useEffect(() => {
    localStorage.setItem('players', JSON.stringify(players));
  }, [players])
  
  // Show a circular progress bar while loading
  if(!initialState) {
    return <CircularProgress />;
  }

  // Signs a request for the Whiteout Survival CDK API/
  // Each request is signed with a salted MD5 hash of the request attributes
  function sign(obj) {
    var str = Object.keys(obj).sort().reduce(function(pre, cur) {
      return (pre ? pre + '&' : '') + cur + '=' + (typeof obj[cur] === 'object' ? JSON.stringify(obj[cur]) : obj[cur]);        
    }, '');

    return {
      sign: (0, CryptoJS.MD5)(str + salt).toString((CryptoJS.enc.Hex)), ...obj
    };
  }

  // Send a request to the Whiteout Survival CDK API to retrieve Player Data
  function playerApi(data) {
    data = sign(data);
    return axios({
        url: 'https://wos-giftcode-api.centurygame.com/api/player',
        method: "POST",
        data: data,
        headers: {'Content-Type': 'application/x-www-form-urlencoded'}
    })
    .then((response) => {
      return response.data;
    })
    .catch((err) => {
      console.log(err.message);
    })
  }

  // Send a request to the Whiteout Survival CDK API to redeem a Gift Code
  function giftCodeApi(data) {
    data = sign(data);
    return axios({
        url: 'https://wos-giftcode-api.centurygame.com/api/gift_code',
        method: "POST",
        data: data,
        headers: {'Content-Type': 'application/x-www-form-urlencoded'}
    })
    .then((response) => {
      return response.data;
    })
    .catch((err) => {
      console.log(err.message);
    })
  }

  // Add a player to the Datagrid
  function addPlayer(p) {
    if(!playerExists(p.fid)) {
      setPlayers(players => {
        return [
          ...players,
          p]
      })
    }
  }

  // Update a player on the datagrip
  function updatePlayer(p) {
    setPlayers(players => {
      return players.map((player) => {
        return player.fid === p.fid
          ? { ...p }
          : { ...player }
      })
    })
  }

  // Remove a player from the datagrid
  function removePlayer(p) {
    setPlayers(players => {
      return players.filter(player => player.fid !== p.fid)
    })
  }

  // Check if a player already exists in the player list
  function playerExists(fid) {
    return players.filter(player => player.fid === fid).length > 0;
  }

  // Get a Players ID
  function getPlayerId(p) {
    return p.fid;
  }

  // Handle the Click Event for the Add Player Button
  async function handleAddPlayer(e) {
    var data = await playerApi({
      fid: fid,
      time: Date.now()
    })

    if(data?.code===0) {
      addPlayer({ 
        fid: data?.data.fid, 
        kid: data?.data.kid, 
        name: data?.data.nickname, 
        avatar_image: data?.data.avatar_image, 
        redemption_status: '' })
    } else {
      setErrorMessage(data.msg);
      setIsError(true);
    }
  }

  // Handle the Click Event for the Remove Player Button
  async function handleRemovePlayer(e) {
    for(const [key, value] of apiRef.current?.getSelectedRows()) {
      removePlayer(value);
      console.debug(key);
      console.debug(value);
    }
  }

  const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))

  // Handle the Cick Event for the Redeem Code Button
  async function handleRedeemCode(e) {
    for(const [, value] of apiRef.current?.getSelectedRows()) {
      updatePlayer({...value, redemption_status: ''});
    }

    for(const [, value] of apiRef.current?.getSelectedRows()) {
      var data = await playerApi({
        fid: value.fid,
        time: Date.now()
      });

      if(data?.code===0) {
        var redemptionResult = await giftCodeApi({
          cdk: cdk,
          fid: value.fid,
          time: Date.now()
        })
        if(redemptionResult?.code===0) {
          updatePlayer({...value, redemption_status: 'Succesfully redemeed'});
          /// Succesful
        } else {
          /// Redemption Failed
          switch(redemptionResult?.err_code) {
            case 40005:
              updatePlayer({...value, redemption_status: 'Redemption Failed: TOO MANY REDEMPTIONS'});
              break;
            case 40007:
              updatePlayer({...value, redemption_status: 'Redemption Failed: EXPIRED GIFT CODE'});
              break;
            case 40008:
              updatePlayer({...value, redemption_status: 'Redemption Failed: PLAYER HAS ALREADY REDEEMED GIFT CODE'});
              break;
            case 40014:
              updatePlayer({...value, redemption_status: 'Redemption Failed: INVALID GIFT CODE'});
              break;
            default:    
              updatePlayer({...value, redemption_status: 'Redemption Failed: ' + redemptionResult?.msg});
          }
        }
      } else {
        /// Login Failed
        updatePlayer({...value, redemption_status: 'Login Failed: ' + data?.msg});
      }
      
      sleep(1000);
    }
  }

  return (
    <div className="App">
      <TextField id="fid" label="Player ID" variant="standard" value={fid} onChange={e => setFid(e.target.value)} />
      <Button variant="outlined" onClick={handleAddPlayer}>Add Player</Button>
      <Button variant="contained" onClick={handleRemovePlayer}>Remove Player</Button>
      <TextField id="cdk" label="Gift Code" variant="standard" value={cdk} onChange={e => setCdk(e.target.value)} />
      <Button variant="contained" onClick={handleRedeemCode}>Redeem Code</Button>
      <DataGrid
        rows={players}
        columns={columns}
        apiRef={apiRef}
        getRowId={getPlayerId}
        initialState={{
          ...initialState
        }}
        pageSizeOptions={[5,10,20,50,100,200]}
        checkboxSelection
        disableRowSelectionOnClick
      />
      <Snackbar
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        open={isError}
        message={errorMessage}
        autoHideDuration={6000}
      />
    </div>
  );
}

export default App;
