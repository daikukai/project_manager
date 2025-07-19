// src/App.jsx

import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp, getDocs, limit } from 'firebase/firestore';

// --- Material UI Imports ---
import {
  Container, AppBar, Toolbar, Typography, Button, Box,
  TextField, CircularProgress,
  Paper, Grid, Card, CardContent, CardActions,
  Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, Select, MenuItem, InputLabel, FormControl,
  Snackbar, Alert, Chip,
  Stack // Added Stack for better layout control
} from '@mui/material';

// Import Material Icons
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';
import DashboardIcon from '@mui/icons-material/Dashboard'; // New icon for ProjectList header
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder'; // New icon for create project section
import FolderOpenIcon from '@mui/icons-material/FolderOpen'; // New icon for available projects section


// --- Firebase Configuration and Initialization ---

const firebaseConfig = {
  apiKey: "AIzaSyBgeA3V4Od6dQROkX2rbaK4Oi3nKidNelg",
  authDomain: "project-manager-e550f.firebaseapp.com",
  databaseURL: "https://project-manager-e550f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "project-manager-e550f",
  storageBucket: "project-manager-e550f.firebasestorage.app",
  messagingSenderId: "214625929654",
  appId: "1:214625929654:web:c0aba18d332dd32b175917"
};

const appId = firebaseConfig.projectId;
const initialAuthToken = null; // Set this to your custom token if you're using one for authentication

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- Contexts for Global State ---
const AuthContext = createContext(null);
const ProjectContext = createContext(null);

// --- Helper Components ---

// Converted to Material UI
const LoadingSpinner = () => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      bgcolor: 'grey.50'
    }}
  >
    <CircularProgress size={80} thickness={4} sx={{ color: 'primary.main', mb: 2 }} />
    <Typography variant="h6" color="text.secondary">Loading...</Typography>
  </Box>
);

// Converted to Material UI Snackbar and Alert
const ToastNotification = ({ message, type, onClose }) => {
  return (
    <Snackbar
      open={!!message}
      autoHideDuration={5000}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
    >
      <Alert
        onClose={onClose}
        severity={type === 'success' ? 'success' : type === 'error' ? 'error' : 'info'}
        sx={{ width: '100%', boxShadow: 3 }}
      >
        {message}
      </Alert>
    </Snackbar>
  );
};

// --- Auth Provider ---
const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        setUserId(user.uid);
        console.log('User logged in:', user.uid);
      } else {
        console.log('No user logged in. Attempting anonymous sign-in or custom token...');
        if (initialAuthToken) {
          try {
            const userCredential = await signInWithCustomToken(auth, initialAuthToken);
            setCurrentUser(userCredential.user);
            setUserId(userCredential.user.uid);
            console.log('Signed in with custom token:', userCredential.user.uid);
          } catch (error) {
            console.error('Error signing in with custom token:', error);
            try {
              const userCredential = await signInAnonymously(auth);
              setCurrentUser(userCredential.user);
              setUserId(userCredential.user.uid);
              console.log('Signed in anonymously (fallback):', userCredential.user.uid);
            } catch (anonError) {
              console.error('Error signing in anonymously:', anonError);
            }
          }
        } else {
          try {
            const userCredential = await signInAnonymously(auth);
            setCurrentUser(userCredential.user);
            setUserId(userCredential.user.uid);
            console.log('Signed in anonymously:', userCredential.user.uid);
          } catch (anonError) {
            console.error('Error signing in anonymously:', anonError);
          }
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <AuthContext.Provider value={{ currentUser, userId }}>
      {children}
    </AuthContext.Provider>
  );
};

// --- Project Provider ---
const ProjectProvider = ({ children }) => {
  const { userId } = useContext(AuthContext);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [loadingProjects, setLoadingProjects] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoadingProjects(false);
      return;
    }

    const projectsRef = collection(db, `artifacts/${appId}/public/data/projects`);
    const q = query(projectsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedProjects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProjects(fetchedProjects);
      setLoadingProjects(false);
      console.log("Projects updated:", fetchedProjects.length);
    }, (error) => {
      console.error("Error fetching projects:", error);
      setLoadingProjects(false);
    });

    return () => unsubscribe();
  }, [userId]);

  if (loadingProjects) {
    return <LoadingSpinner />;
  }

  return (
    <ProjectContext.Provider value={{ projects, selectedProject, setSelectedProject }}>
      {children}
    </ProjectContext.Provider>
  );
};

// --- Main App Component ---
const App = () => {
  const { userId } = useContext(AuthContext);
  const { selectedProject, setSelectedProject } = useContext(ProjectContext);
  const [toast, setToast] = useState(null);
  const [lastCommentTimestamp, setLastCommentTimestamp] = useState({}); // To track last comment per task

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    // Clear toast after 5 seconds
    setTimeout(() => setToast(null), 5000);
  }, []);

  // Real-time comment notifications
  useEffect(() => {
    if (!selectedProject || !userId) return;

    const tasksRef = collection(db, `artifacts/${appId}/public/data/projects/${selectedProject.id}/tasks`);
    const unsubscribeTasks = onSnapshot(tasksRef, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added" || change.type === "modified") {
          const task = { id: change.doc.id, ...change.doc.data() };
          const commentsRef = collection(db, `artifacts/${appId}/public/data/projects/${selectedProject.id}/tasks/${task.id}/comments`);
          const qComments = query(commentsRef, orderBy('createdAt', 'desc'), limit(1)); // Listen for the latest comment

          const unsubscribeComments = onSnapshot(qComments, (commentSnapshot) => {
            if (!commentSnapshot.empty) {
              const latestComment = { id: commentSnapshot.docs[0].id, ...commentSnapshot.docs[0].data() };
              if (latestComment.userId !== userId) { // Only show if not my own comment
                const commentTime = latestComment.createdAt?.toDate().getTime();
                const knownLastTime = lastCommentTimestamp[task.id] || 0;

                if (commentTime && commentTime > knownLastTime) {
                  setLastCommentTimestamp(prev => ({ ...prev, [task.id]: commentTime }));
                  showToast(`New comment on task "${task.title}" by ${latestComment.userName || 'Someone'}`, 'info');
                }
              }
            }
          }, (error) => {
            console.error("Error listening for comments on task", task.id, ":", error);
          });

          // Cleanup comments listener when task changes or unmounts
          return () => unsubscribeComments();
        }
      });
    }, (error) => {
      console.error("Error listening for tasks for comment notifications:", error);
    });

    return () => unsubscribeTasks();
  }, [selectedProject, userId, showToast, lastCommentTimestamp]);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'grey.100', fontFamily: 'Arial, sans-serif' }}>
      <AppBar position="sticky" elevation={1} sx={{ bgcolor: 'white', zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h5" component="h1" sx={{ flexGrow: 1, fontWeight: 'bold', color: 'primary.main' }}>
            Apex Inc
          </Typography>
          <Typography variant="body2" color="text.secondary">
            User ID: <Box component="span" sx={{ fontWeight: 'bold', color: 'primary.main' }}>{userId || 'N/A'}</Box>
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ mt: 4, py: 4 }}>
        {selectedProject ? (
          <ProjectBoard project={selectedProject} onBack={() => setSelectedProject(null)} showToast={showToast} />
        ) : (
          <ProjectList showToast={showToast} />
        )}
      </Container>

      {toast && (
        <ToastNotification
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </Box>
  );
};

// --- ProjectList Component (Updated with Material UI for beautification) ---
const ProjectList = ({ showToast }) => {
  const { projects, setSelectedProject } = useContext(ProjectContext);
  const { userId } = useContext(AuthContext);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!newProjectName.trim()) {
      showToast("Project name cannot be empty.", "info");
      return;
    }
    setCreatingProject(true);
    try {
      const projectsRef = collection(db, `artifacts/${appId}/public/data/projects`);
      await addDoc(projectsRef, {
        name: newProjectName.trim(),
        description: newProjectDescription.trim(),
        createdAt: serverTimestamp(),
        createdBy: userId,
        members: [userId]
      });
      setNewProjectName('');
      setNewProjectDescription('');
      showToast("Project created successfully!", "success");
    } catch (error) {
      console.error("Error creating project:", error);
      showToast("Error creating project.", "error");
    } finally {
      setCreatingProject(false);
    }
  };

  const handleDeleteProject = async (projectId, projectName) => {
    if (!window.confirm(`Are you sure you want to delete the project "${projectName}"? This will also delete all its tasks and comments. This action cannot be undone.`)) {
      return;
    }

    try {
      // 1. Get all tasks for the project
      const tasksRef = collection(db, `artifacts/${appId}/public/data/projects/${projectId}/tasks`);
      const taskDocs = await getDocs(tasksRef);

      // 2. For each task, delete all its comments, then delete the task
      const deletePromises = taskDocs.docs.map(async (taskDoc) => {
        const taskId = taskDoc.id;
        const commentsRef = collection(db, `artifacts/${appId}/public/data/projects/${projectId}/tasks/${taskId}/comments`);
        const commentDocs = await getDocs(commentsRef);
        const deleteCommentPromises = commentDocs.docs.map(d => deleteDoc(d.ref));
        await Promise.all(deleteCommentPromises);
        return deleteDoc(taskDoc.ref);
      });

      await Promise.all(deletePromises);

      // 3. Finally, delete the project document
      const projectRef = doc(db, `artifacts/${appId}/public/data/projects/${projectId}`);
      await deleteDoc(projectRef);

      showToast(`Project "${projectName}" and all its contents deleted successfully!`, "success");
      setSelectedProject(null); // Unselect if the deleted project was active
    } catch (error) {
      console.error("Error deleting project:", error);
      showToast("Error deleting project. Please check console for details.", "error");
    }
  };


  return (
    <Container maxWidth="lg" sx={{ mt: 4, p: 3, bgcolor: 'background.paper', borderRadius: 2, boxShadow: 3 }}>
      {/* Enhanced Main Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 5, flexDirection: 'column' }}>
        <DashboardIcon sx={{ fontSize: 60, color: 'primary.main', mb: 1 }} />
        <Typography variant="h3" component="h2" gutterBottom align="center" sx={{ fontWeight: 'bold', color: 'primary.dark' }}>
          Your Project Hub
        </Typography>
        <Typography variant="h6" color="text.secondary" align="center" sx={{ maxWidth: '600px' }}>
          Organize, track, and manage all your projects efficiently. Create a new project or dive into an existing one.
        </Typography>
      </Box>


      <Paper elevation={4} sx={{ mb: 6, p: 4, bgcolor: 'primary.50', borderRadius: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <CreateNewFolderIcon sx={{ fontSize: 40, color: 'primary.dark', mr: 2 }} />
          <Typography variant="h5" component="h3" sx={{ color: 'primary.dark', fontWeight: 'bold' }}>
            Create New Project
          </Typography>
        </Box>
        <Box component="form" onSubmit={handleCreateProject} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <TextField
            label="Project Name"
            variant="outlined"
            fullWidth
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder="e.g., Q3 Marketing Campaign, Website Redesign"
            disabled={creatingProject}
            required
            InputProps={{
              startAdornment: (
                <InputLabel sx={{ position: 'relative', mr: 1, '&:before': { content: '""', display: 'inline-block', height: '1.2em', verticalAlign: 'middle' } }}>
                  <FolderOpenIcon sx={{ color: 'action.active', mr: 0.5 }} />
                </InputLabel>
              ),
            }}
          />
          <TextField
            label="Description"
            variant="outlined"
            fullWidth
            multiline
            rows={4}
            value={newProjectDescription}
            onChange={(e) => setNewProjectDescription(e.target.value)}
            placeholder="Briefly describe the project's goals, scope, or key objectives."
            disabled={creatingProject}
          />
          <Button
            type="submit"
            variant="contained"
            color="primary"
            size="large"
            disabled={creatingProject}
            sx={{ alignSelf: 'flex-start', px: 4, py: 1.5, borderRadius: 2 }}
            startIcon={creatingProject ? null : <AddIcon />}
          >
            {creatingProject ? (
              <>
                <CircularProgress size={24} color="inherit" sx={{ mr: 1 }} />
                Creating...
              </>
            ) : (
              'Create Project'
            )}
          </Button>
        </Box>
      </Paper>

      <Box sx={{ mt: 6 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <FolderOpenIcon sx={{ fontSize: 40, color: 'text.primary', mr: 2 }} />
          <Typography variant="h5" component="h3" sx={{ color: 'text.primary', fontWeight: 'bold' }}>
            Available Projects
          </Typography>
        </Box>

        {projects.length === 0 ? (
          <Paper elevation={2} sx={{ p: 4, textAlign: 'center', bgcolor: 'grey.50', borderRadius: 2 }}>
            <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
              It looks like you don't have any projects yet.
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Start by creating your first project above!
            </Typography>
            <AddIcon sx={{ fontSize: 50, color: 'text.disabled', mt: 3 }} />
          </Paper>
        ) : (
          <Grid container spacing={4}> {/* Increased spacing */}
            {projects.map(project => (
              <Grid item xs={12} sm={6} md={4} key={project.id}>
                <Card
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    p: 2,
                    transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
                    '&:hover': {
                      transform: 'translateY(-5px)',
                      boxShadow: 8,
                    },
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'grey.200'
                  }}
                >
                  <CardContent sx={{ flexGrow: 1, cursor: 'pointer', pb: 0 }} onClick={() => setSelectedProject(project)}>
                    <Typography variant="h6" component="h4" sx={{ mb: 1.5, color: 'secondary.main', fontWeight: 'bold' }}>
                      {project.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2, minHeight: '3em', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {project.description || 'No description provided for this project.'}
                    </Typography>
                    <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                      Created: {project.createdAt?.toDate ? new Date(project.createdAt.toDate()).toLocaleDateString() : 'N/A'}
                    </Typography>
                  </CardContent>
                  <CardActions sx={{ justifyContent: 'space-between', pt: 2 }}>
                    <Button
                      size="small"
                      variant="contained" // Changed to contained for more prominence
                      color="primary"
                      onClick={(e) => { e.stopPropagation(); setSelectedProject(project); }}
                      sx={{ px: 3 }}
                    >
                      View Board
                    </Button>
                    <IconButton
                      aria-label={`delete project ${project.name}`}
                      onClick={(e) => { e.stopPropagation(); handleDeleteProject(project.id, project.name); }}
                      color="error"
                      size="medium" // Increased size
                    >
                      <DeleteIcon />
                    </IconButton>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Box>
    </Container>
  );
};

// --- ProjectBoard Component (Converted to Material UI) ---
const ProjectBoard = ({ project, onBack, showToast }) => {
  const [tasks, setTasks] = useState([]);
  const { userId } = useContext(AuthContext);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);

  useEffect(() => {
    if (!project?.id) return;

    const tasksRef = collection(db, `artifacts/${appId}/public/data/projects/${project.id}/tasks`);
    const q = query(tasksRef, orderBy('createdAt'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTasks(fetchedTasks);
      console.log(`Tasks for project ${project.name} updated:`, fetchedTasks.length);
    }, (error) => {
      console.error("Error fetching tasks:", error);
    });

    return () => unsubscribe();
  }, [project?.id]);

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) {
      showToast("Task title cannot be empty.", "info");
      return;
    }
    try {
      const tasksRef = collection(db, `artifacts/${appId}/public/data/projects/${project.id}/tasks`);
      await addDoc(tasksRef, {
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim(),
        status: 'todo',
        assignedTo: null,
        assignedToDisplayName: null,
        createdAt: serverTimestamp(),
        createdBy: userId,
        projectId: project.id // Store project ID in task for easier queries if needed
      });
      setNewTaskTitle('');
      setNewTaskDescription('');
      setShowAddTaskModal(false); // Close modal after adding
      showToast("Task added successfully!", "success");
    } catch (error) {
      console.error("Error adding task:", error);
      showToast("Error adding task.", "error");
    }
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4, pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Button
          onClick={onBack}
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          sx={{ mr: 2 }}
        >
          Back to Projects
        </Button>
        <Typography variant="h4" component="h2" sx={{ flexGrow: 1, textAlign: 'center', color: 'primary.dark', fontWeight: 'bold' }}>
          {project.name} Board
        </Typography>
        <Button
          onClick={() => setShowAddTaskModal(true)}
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
        >
          Add New Task
        </Button>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <TaskList title="To Do" status="todo" tasks={tasks} setSelectedTask={setSelectedTask} />
        </Grid>
        <Grid item xs={12} md={4}>
          <TaskList title="In Progress" status="in-progress" tasks={tasks} setSelectedTask={setSelectedTask} />
        </Grid>
        <Grid item xs={12} md={4}>
          <TaskList title="Done" status="done" tasks={tasks} setSelectedTask={setSelectedTask} />
        </Grid>
      </Grid>

      {/* Add Task Modal */}
      {showAddTaskModal && (
        <TaskModal
          title="Add New Task"
          onClose={() => setShowAddTaskModal(false)}
          onSubmit={handleAddTask} // ProjectBoard's handleAddTask
          taskData={{ title: newTaskTitle, description: newTaskDescription }}
          setTaskData={{ setTitle: setNewTaskTitle, setDescription: setNewTaskDescription }}
          isNewTask={true}
          showToast={showToast}
        />
      )}

      {/* Edit Task Modal */}
      {selectedTask && (
        <TaskModal
          title="Edit Task"
          onClose={() => setSelectedTask(null)}
          task={selectedTask}
          project={project} // Pass project so comments can be fetched
          showToast={showToast}
        />
      )}
    </Box>
  );
};

// --- TaskList Component (Converted to Material UI) ---
const TaskList = ({ title, status, tasks, setSelectedTask }) => {
  const filteredTasks = tasks.filter(task => task.status === status);

  return (
    <Paper elevation={2} sx={{ p: 2, minHeight: '300px', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h6" component="h3" sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 1, mb: 2, color: 'text.primary' }}>
        {title} ({filteredTasks.length})
      </Typography>
      <Box sx={{ flexGrow: 1, overflowY: 'auto', pr: 1 }}>
        {filteredTasks.length === 0 ? (
          <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 4 }}>
            No tasks in this column.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {filteredTasks.map(task => (
              <TaskCard key={task.id} task={task} setSelectedTask={setSelectedTask} />
            ))}
          </Box>
        )}
      </Box>
    </Paper>
  );
};

// --- TaskCard Component (Converted to Material UI) ---
const TaskCard = ({ task, setSelectedTask }) => {
  return (
    <Card
      onClick={() => setSelectedTask(task)}
      sx={{
        bgcolor: 'grey.50',
        border: '1px solid',
        borderColor: 'grey.200',
        p: 2,
        borderRadius: 1,
        boxShadow: 1,
        cursor: 'pointer',
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': {
          transform: 'translateY(-3px)',
          boxShadow: 3,
        }
      }}
    >
      <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
        <Typography variant="subtitle1" component="h4" sx={{ mb: 1, color: 'text.primary', fontWeight: 'medium' }}>
          {task.title}
        </Typography>
        {task.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {task.description}
          </Typography>
        )}
        {task.assignedToDisplayName && (
          <Chip label={task.assignedToDisplayName} color="primary" variant="outlined" size="small" />
        )}
      </CardContent>
    </Card>
  );
};

// --- TaskModal Component (for Add/Edit Task & Comments) ---
const TaskModal = ({ title, onClose, task, project, onSubmit, isNewTask = false, showToast, taskData, setTaskData }) => {
  // State for *editing* existing tasks. For new tasks, we'll use taskData/setTaskData directly.
  const [currentTitle, setCurrentTitle] = useState(task?.title || '');
  const [currentDescription, setCurrentDescription] = useState(task?.description || '');
  const [currentStatus, setCurrentStatus] = useState(task?.status || 'todo');
  const [currentAssignedTo, setCurrentAssignedTo] = useState(task?.assignedTo || '');
  const [currentAssignedToDisplayName, setCurrentAssignedToDisplayName] = useState(task?.assignedToDisplayName || '');

  const [comments, setComments] = useState([]);
  const [newCommentText, setNewCommentText] = useState('');
  const { userId, currentUser } = useContext(AuthContext);

  useEffect(() => {
    // This effect only runs for existing tasks to fetch their comments
    if (!isNewTask && task?.id && project?.id) {
      const commentsRef = collection(db, `artifacts/${appId}/public/data/projects/${project.id}/tasks/${task.id}/comments`);
      const q = query(commentsRef, orderBy('createdAt', 'asc'));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedComments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setComments(fetchedComments);
      }, (error) => {
        console.error("Error fetching comments:", error);
      });
      return () => unsubscribe();
    }
  }, [task?.id, project?.id, isNewTask]);

  const handleSave = async (e) => {
    e.preventDefault();
    // When adding a new task, ProjectBoard's handleAddTask handles its own validation.
    // When editing an existing task, TaskModal handles its validation.
    if (isNewTask) {
      // For new tasks, onSubmit is handleAddTask from ProjectBoard
      onSubmit(e);
    } else {
      if (!currentTitle.trim()) {
        showToast("Task title cannot be empty.", "info");
        return;
      }
      try {
        const taskRef = doc(db, `artifacts/${appId}/public/data/projects/${project.id}/tasks/${task.id}`);
        await updateDoc(taskRef, {
          title: currentTitle.trim(),
          description: currentDescription.trim(),
          status: currentStatus,
          assignedTo: currentAssignedTo || null, // Store null if empty string
          assignedToDisplayName: currentAssignedToDisplayName || null // Store null if empty string
        });
        showToast("Task updated successfully!", "success");
        onClose();
      } catch (error) {
        console.error("Error updating task:", error);
        showToast("Error updating task.", "error");
      }
    }
  };

  const handleDeleteTask = async () => {
    if (window.confirm("Are you sure you want to delete this task and all its comments? This action cannot be undone.")) {
      try {
        // Delete all comments first
        const commentsRef = collection(db, `artifacts/${appId}/public/data/projects/${project.id}/tasks/${task.id}/comments`);
        const commentDocs = await getDocs(commentsRef);
        const deleteCommentPromises = commentDocs.docs.map(d => deleteDoc(d.ref));
        await Promise.all(deleteCommentPromises);

        // Then delete the task
        const taskRef = doc(db, `artifacts/${appId}/public/data/projects/${project.id}/tasks/${task.id}`);
        await deleteDoc(taskRef);

        showToast("Task deleted successfully!", "success");
        onClose(); // Close the modal after deletion
      } catch (error) {
        console.error("Error deleting task:", error);
        showToast("Error deleting task.", "error");
      }
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;

    try {
      const commentsRef = collection(db, `artifacts/${appId}/public/data/projects/${project.id}/tasks/${task.id}/comments`);
      await addDoc(commentsRef, {
        text: newCommentText.trim(),
        createdAt: serverTimestamp(),
        userId: userId,
        userName: currentUser?.displayName || currentUser?.email || 'Anonymous User' // Use display name or email, fallback to Anonymous
      });
      setNewCommentText(''); // Clear the input field
    } catch (error) {
      console.error("Error adding comment:", error);
      showToast("Error adding comment.", "error");
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h5" component="span" sx={{ fontWeight: 'bold' }}>{title}</Typography>
          <IconButton onClick={onClose}><CloseIcon /></IconButton>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        <Box component="form" onSubmit={handleSave} sx={{ mb: 4 }}>
          {/* Title TextField */}
          <TextField
            label="Title"
            variant="outlined"
            fullWidth
            // Conditionally use parent state for new tasks, or internal state for existing
            value={isNewTask ? (taskData?.title || '') : currentTitle}
            onChange={(e) => {
              if (isNewTask) {
                setTaskData?.setTitle(e.target.value);
              } else {
                setCurrentTitle(e.target.value);
              }
            }}
            required
            sx={{ mb: 3 }}
          />
          {/* Description TextField */}
          <TextField
            label="Description"
            variant="outlined"
            fullWidth
            multiline
            rows={4}
            // Conditionally use parent state for new tasks, or internal state for existing
            value={isNewTask ? (taskData?.description || '') : currentDescription}
            onChange={(e) => {
              if (isNewTask) {
                setTaskData?.setDescription(e.target.value);
              } else {
                setCurrentDescription(e.target.value);
              }
            }}
            sx={{ mb: 3 }}
          />

          {/* Conditional fields only for existing tasks */}
          {!isNewTask && (
            <>
              <FormControl fullWidth variant="outlined" sx={{ mb: 3 }}>
                <InputLabel id="task-status-label">Status</InputLabel>
                <Select
                  labelId="task-status-label"
                  id="taskStatus"
                  value={currentStatus}
                  onChange={(e) => setCurrentStatus(e.target.value)}
                  label="Status"
                >
                  <MenuItem value="todo">To Do</MenuItem>
                  <MenuItem value="in-progress">In Progress</MenuItem>
                  <MenuItem value="done">Done</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="Assigned To (User ID)"
                variant="outlined"
                fullWidth
                value={currentAssignedTo}
                onChange={(e) => setCurrentAssignedTo(e.target.value)}
                placeholder="Enter User ID (optional)"
                sx={{ mb: 3 }}
              />
              <TextField
                label="Assigned To (Display Name - optional)"
                variant="outlined"
                fullWidth
                value={currentAssignedToDisplayName}
                onChange={(e) => setCurrentAssignedToDisplayName(e.target.value)}
                placeholder="e.g., John Doe"
                sx={{ mb: 3 }}
              />
            </>
          )}

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 3 }}>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              size="large"
            >
              {isNewTask ? 'Add Task' : 'Save Changes'}
            </Button>
            {!isNewTask && (
              <Button
                type="button"
                onClick={handleDeleteTask}
                variant="outlined"
                color="error"
                startIcon={<DeleteIcon />}
              >
                Delete Task
              </Button>
            )}
          </Box>
        </Box>

        {/* Comments section is only for existing tasks */}
        {!isNewTask && (
          <Box sx={{ mt: 4, pt: 3, borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography variant="h6" component="h4" gutterBottom sx={{ mb: 2, fontWeight: 'bold' }}>Comments</Typography>
            <Paper elevation={0} sx={{ maxHeight: '200px', overflowY: 'auto', p: 2, mb: 3, bgcolor: 'grey.50', border: '1px solid', borderColor: 'grey.200' }}>
              {comments.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                  No comments yet. Be the first to add one!
                </Typography>
              ) : (
                comments.map(comment => (
                  <Box key={comment.id} sx={{ mb: 2, pb: 2, borderBottom: '1px solid', borderColor: 'grey.100', '&:last-child': { borderBottom: 'none', mb: 0, pb: 0 } }}>
                    <Typography variant="body2" color="text.primary">{comment.text}</Typography>
                    <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5 }}>
                      — {comment.userName || 'Anonymous'} at {comment.createdAt?.toDate ? new Date(comment.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                    </Typography>
                  </Box>
                ))
              )}
            </Paper>
            <Box component="form" onSubmit={handleAddComment} sx={{ display: 'flex', gap: 2 }}>
              <TextField
                variant="outlined"
                fullWidth
                multiline
                rows={2}
                placeholder="Add a comment..."
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                required
              />
              <Button
                type="submit"
                variant="contained"
                color="secondary"
                sx={{ flexShrink: 0 }}
              >
                Post
              </Button>
            </Box>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
};


// --- Root Component (Wrapper for Providers) ---
const Root = () => (
  <AuthProvider>
    <ProjectProvider>
      <App />
    </ProjectProvider>
  </AuthProvider>
);

export default Root;