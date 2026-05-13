import { useState, useCallback, useEffect } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { GameMessage } from '../../types';

interface ChessGameProps {
  channel: RTCDataChannel;
  isHost: boolean; // Host plays White, Joiner plays Black
  onBackToLobby: () => void;
}

export function ChessGame({ channel, isHost, onBackToLobby }: ChessGameProps) {
  const [game, setGame] = useState(new Chess());
  const [fen, setFen] = useState(game.fen());
  const [gameOverStr, setGameOverStr] = useState<string | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [optionSquares, setOptionSquares] = useState({});

  const isNetworked = !!channel;
  const myColor = isHost ? 'white' : 'black';
  
  // In hotseat, orientation follows the current turn. In network, it follows myColor.
  const boardOrientation = isNetworked ? myColor : (game.turn() === 'w' ? 'white' : 'black');
  
  // In hotseat, it is always 'your' turn since players share the device.
  const isMyTurn = isNetworked ? game.turn() === myColor[0] : true;

  const sendMessage = useCallback((payload: any) => {
    if (isNetworked && channel.readyState === 'open') {
      const msg: GameMessage = {
        type: 'GAME_MESSAGE',
        game: 'CHESS',
        payload
      };
      channel.send(JSON.stringify(msg));
    }
  }, [channel, isNetworked]);

  // Handle incoming moves and restarts
  useEffect(() => {
    if (!isNetworked) return;
    
    const handleMessage = (event: MessageEvent) => {
      const message = JSON.parse(event.data);
      if (message.type === 'GAME_MESSAGE' && message.game === 'CHESS') {
        const data = message.payload;
        
        if (data.type === 'MOVE') {
          const gameCopy = new Chess(fen);
          gameCopy.move(data.move);
          setGame(gameCopy);
          setFen(gameCopy.fen());
          checkGameOver(gameCopy);
        } else if (data.type === 'RESTART') {
          const newGame = new Chess();
          setGame(newGame);
          setFen(newGame.fen());
          setGameOverStr(null);
        }
      }
    };

    channel.addEventListener('message', handleMessage);
    return () => channel.removeEventListener('message', handleMessage);
  }, [channel, fen, isNetworked]);

  const checkGameOver = (current_game: Chess) => {
    if (current_game.isCheckmate()) setGameOverStr("Checkmate!");
    else if (current_game.isDraw()) setGameOverStr("Draw!");
    else if (current_game.isStalemate()) setGameOverStr("Stalemate!");
  };

  const makeMove = (move: { from: string; to: string; promotion?: string }) => {
    try {
      const gameCopy = new Chess(fen);
      const result = gameCopy.move(move);

      if (result === null) return false;

      setGame(gameCopy);
      setFen(gameCopy.fen());
      checkGameOver(gameCopy);

      // Send to peer if networked
      sendMessage({ type: 'MOVE', move });
      return true;
    } catch (e) {
      return false; // Illegal move
    }
  };

  const onDrop = ({ sourceSquare, targetSquare }: any) => {
    // Prevent moving if not our turn or game is over
    if (!isMyTurn || gameOverStr || !targetSquare) return false;

    const success = makeMove({
      from: sourceSquare,
      to: targetSquare,
      promotion: 'q', // always promote to queen for simplicity
    });

    if (success) {
      setSelectedSquare(null);
      setOptionSquares({});
    }

    return success;
  };

  const onSquareClick = ({ square }: any) => {
    if (!isMyTurn || gameOverStr) return;

    if (selectedSquare === square) {
      setSelectedSquare(null);
      setOptionSquares({});
      return;
    }

    if (selectedSquare) {
      // Trying to move
      const move = makeMove({
        from: selectedSquare,
        to: square,
        promotion: 'q'
      });
      if (move) {
        setSelectedSquare(null);
        setOptionSquares({});
        return; // Valid move made
      }
    }
    
    // Select piece
    const gameCopy = new Chess(fen);
    const moves = gameCopy.moves({ square: square, verbose: true });
    
    if (moves.length === 0) {
      setSelectedSquare(null);
      setOptionSquares({});
      return;
    }

    setSelectedSquare(square);
    const newSquares: Record<string, any> = {};
    moves.forEach((m: any) => {
      newSquares[m.to] = {
        background: "radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)",
        borderRadius: "50%"
      };
    });
    newSquares[square] = {
      background: "rgba(255, 255, 0, 0.4)"
    };
    setOptionSquares(newSquares);
  };

  const startNewGame = () => {
    const newGame = new Chess();
    setGame(newGame);
    setFen(newGame.fen());
    setGameOverStr(null);
    sendMessage({ type: 'RESTART' });
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 w-full max-w-md mx-auto min-h-[60vh]">
      <div className="flex w-full justify-between items-center mb-6">
        <button 
          onClick={onBackToLobby}
          className="text-sm font-medium text-gray-500 hover:text-gray-900"
        >
          &larr; Lobby
        </button>
        <span className={`px-3 py-1 rounded-full text-sm font-bold ${
          isMyTurn ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
        }`}>
          {isMyTurn ? "Your Turn" : "Opponent's Turn"}
        </span>
      </div>

      <div className="w-full max-w-[320px] aspect-square rounded overflow-hidden shadow-2xl mb-8 touch-none">
        <Chessboard 
          options={{
            position: fen,
            onPieceDrop: onDrop,
            onSquareClick: onSquareClick,
            boardOrientation: boardOrientation as "white" | "black",
            darkSquareStyle: { backgroundColor: '#779556' },
            lightSquareStyle: { backgroundColor: '#ebecd0' },
            squareStyles: optionSquares,
            animationDurationInMs: isNetworked ? 300 : 0
          }}
        />
      </div>

      {gameOverStr && (
        <div className="text-center">
          <h3 className="text-2xl font-bold text-gray-900 mb-4">{gameOverStr}</h3>
          <button 
            onClick={startNewGame}
            className="px-6 py-2 bg-indigo-600 font-medium rounded-lg text-white shadow hover:bg-indigo-700"
          >
            Play Again
          </button>
        </div>
      )}
    </div>
  );
}
