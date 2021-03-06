// FILE: license.js

// SSCD (Super Simple Collision Detection) is distributed with the zlib-license:

/* 
  This software is provided 'as-is', without any express or implied
  warranty.  In no event will the authors be held liable for any damages
  arising from the use of this software.

  Permission is granted to anyone to use this software for any purpose,
  including commercial applications, and to alter it and redistribute it
  freely, subject to the following restrictions:

  1. The origin of this software must not be misrepresented; you must not
     claim that you wrote the original software. If you use this software
     in a product, an acknowledgment in the product documentation would be
     appreciated but is not required.
  2. Altered source versions must be plainly marked as such, and must not be
     misrepresented as being the original software.
  3. This notice may not be removed or altered from any source distribution.

  Ronen Ness
  ronenness@gmail.com

*/

// FILE: world.js

/*
* Physical world contains a grid of shapes you can efficiently check collision with
* Author: Ronen Ness, 2015
*/


// set namespace
var SSCD = SSCD || {};

// version identifier
SSCD.VERSION = 1.0;

// a collision world. you create an instance of this class and add bodies to it to check collision.
//
// params is an optional dictionary with the following optional settings:
//			grid_size: for better performance, the world is divided into a grid of world-chunks and when collision is checked we will
//							only match objects from the same chunk(s) on grid. this param defines the grid size. default to 512.
SSCD.World = function (params) {
	// set defaults
	params = params || {};
	params.grid_size = params.grid_size || 512;

	// create grid and set params
	this.__bodies = {};
	this.__params = params;

	// create the empty collision flags dictionary
	this.__collision_tags = {};
	this.__next_coll_tag = 0;
};

// collision world prototype
SSCD.World.prototype = {

	// define a new collision tag
	__create_collision_tag: function (name)
	{
		// if already exist throw exception
		if (this.__collision_tags[name])
		{
			throw new SSCD.IllegalActionError("Collision tag named '" + name + "' already exist!");
		}

		// set collision tag
		this.__collision_tags[name] = 1 << this.__next_coll_tag++;
	},
	
	// all-tags flags
	_ALL_TAGS_VAL: Number.MAX_SAFE_INTEGER || 4294967295,
	
	// clean-up world memory
	cleanup: function()
	{
		// iterate over grid rows
		var rows = Object.keys(this.__bodies);
		for (var _i = 0; _i < rows.length; ++_i)
		{
			var i = rows[_i];
			
			// iterate over grid columns in current row:
			var columns = Object.keys(this.__bodies[i]);
			for (var _j = 0; _j < columns.length; ++_j)
			{
				var j = columns[_j];
				
				// if empty grid chunk delete it
				if (this.__bodies[i][j].length === 0)
				{
					delete this.__bodies[i][j];
				}
			}
			
			// if no more columns are left in current row delete the row itself
			if (Object.keys(this.__bodies[i]).length === 0)
			{
				delete this.__bodies[i];
			}
		}
	},
	
	// get the hash value of a list of collision tags or individual tag
	// tags can either be a single string or a list of strings
	__get_tags_value: function(tags)
	{
		// special case: undefined return all possible tags
		if (tags === undefined)
		{
			return this._ALL_TAGS_VAL;
		}
		
		// single tag:
		if (typeof tags === "string")
		{
			return this.__collision_tag(tags);
		}
		
		// else, assume a list
		var ret = 0;
		for (var i = 0; i < tags.length; ++i)
		{
			ret |= this.__collision_tag(tags[i]);
		}
		return ret;
	},
	
	// return the value of a single collision tag, define it if not exist
	__collision_tag: function (name)
	{		
		// if tag doesn't exist create it
		if (this.__collision_tags[name] === undefined)
		{
			this.__create_collision_tag(name);
		}
		
		// return collision tag
		return this.__collision_tags[name];
	},
	
	// get the grid range that this object touches
	__get_grid_range: function(obj)
	{
		// get bounding box
		var aabb = obj.get_aabb();
		
		// calc all grid chunks this shape touches
		var min_i = Math.floor((aabb.position.x) / this.__params.grid_size);
		var min_j = Math.floor((aabb.position.y) / this.__params.grid_size);
		var max_i = Math.floor((aabb.position.x + aabb.size.x) / this.__params.grid_size);
		var max_j = Math.floor((aabb.position.y + aabb.size.y) / this.__params.grid_size);
		
		// return grid range
		return {min_x: min_i, min_y: min_j, max_x: max_i, max_y: max_j};
	},
	
	// add collision object to world
	add: function (obj)
	{
		// if object already in world throw exception
		if (obj.__world)
		{
			throw new SSCD.IllegalActionError("Object to add is already in a collision world!");
		}
	
		// get grid range
		var grids = this.__get_grid_range(obj);
		
		// add shape to all grid parts
		for (var i = grids.min_x; i <= grids.max_x; ++i)
		{
			for (var j = grids.min_y; j <= grids.max_y; ++j)
			{
				// make sure lists exist
				this.__bodies[i] = this.__bodies[i] || {};
				this.__bodies[i][j] = this.__bodies[i][j] || [];
				
				// get current grid chunk
				var curr_grid_chunk = this.__bodies[i][j];
				
				// add object to grid chunk
				curr_grid_chunk.push(obj);
				
				// add chunk to shape chunks list
				obj.__grid_chunks.push(curr_grid_chunk);
			}
		}
		
		// set world and grid chunks boundaries
		obj.__world = this;
		obj.__grid_bounderies = grids;
		
		// return the newly added object
		return obj;
	},
	
	// remove object from world
	remove: function (obj)
	{
		// if object is not in this world throw exception
		if (obj.__world !== this)
		{
			throw new SSCD.IllegalActionError("Object to remove is not in this collision world!");
		}
		
		// remove from all the grid chunks
		for (var i = 0; i < obj.__grid_chunks.length; ++i)
		{
			// get current grid chunk
			var grid_chunk = obj.__grid_chunks[i];

			// remove object from grid
			for (var j = 0; j < grid_chunk.length; ++j)
			{
				if (grid_chunk[j] === obj)
				{
					grid_chunk.splice(j, 1);
					break;
				}
			}
		}
		
		// clear shape world chunks and world pointer
		obj.__grid_chunks = [];
		obj.__world = null;
		obj.__grid_bounderies = null;
	},
	
	// update object grid when it moves or resize etc.
	// this function is used internally by the collision shapes.
	__update_shape_grid: function(obj)
	{
		this.remove(obj);
		this.add(obj);
	},
	
	// check collision and return first object found.
	// obj: object to check collision with (vector or collision shape)
	// collision_tags: optional single or multiple tags to check collision with
	// return: first object collided with, or null if don't collide with anything
	pick_object: function(obj, collision_tags)
	{
		var outlist = [];
		if (this.test_collision(obj, collision_tags, outlist, 1))
		{
			return outlist[0];
		}
		return null;
	},
	
	// test collision with vector or object
	// obj: object to check collision with, can be either Vector (for point collision) or any collision shape.
	// collision_tags: optional string or list of strings of tags to match collision with. if undefined will accept all tags
	// out_list: optional output list. if provided, will be filled with all objects collided with. note: collision is more efficient if not provided.
	// ret_objs_count: if provided, will limit returned objects to given count.
	// return true if collided with anything, false otherwise.
	test_collision: function (obj, collision_tags, out_list, ret_objs_count)
	{
		// default collision flags
		collision_tags = this.__get_tags_value(collision_tags);
		
		// handle vector
		if (obj instanceof SSCD.Vector)
		{
			return this.__test_collision_point(obj, collision_tags, out_list);
		}
		// handle collision with shape
		if (obj.is_shape)
		{
			return this.__test_collision_shape(obj, collision_tags, out_list);
		}
	},
	
	// test collision for given point
	// see test_collision comment for more info
	__test_collision_point: function (vector, collision_tags_val, out_list, ret_objs_count)
	{
		// get current grid size
		var grid_size = this.__params.grid_size;
		
		// get the grid chunk to test collision with
		var i = Math.floor((vector.x) / grid_size);
		var j = Math.floor((vector.y) / grid_size);
		
		// if grid chunk is not in use return empty list
		if (this.__bodies[i] === undefined || this.__bodies[i][j] === undefined)
		{
			return false;
		}
		
		// get current grid chunk
		var grid_chunk = this.__bodies[i][j];
		
		// iterate over all objects in current grid chunk and add them to render list
		var found = 0;
		for (var i = 0; i < grid_chunk.length; ++i)
		{
			// get current object to test
			var curr_obj = grid_chunk[i];
			
			// if collision tags don't match skip this object
			if (!curr_obj.collision_tags_match(collision_tags_val))
			{
				continue;
			}
			
			// if collide with object:
			if (curr_obj.test_collide_with(vector))
			{
				// if got collision list to fill, add object and set return value to true
				if (out_list)
				{
					found++;
					out_list.push(curr_obj);
					if (ret_objs_count && found >= ret_objs_count)
					{
						return true;
					}
				}
				// if don't have collision list to fill simply return true
				else
				{
					return true;
				}
			}
		}

		// return if collided 
		// note: get here only if got list to fill or if no collision found
		return found > 0;
	},
	
	// test collision with other shape
	// see test_collision comment for more info
	__test_collision_shape: function (obj, collision_tags_val, out_list, ret_objs_count)
	{
		// if shape is in this world, use its grid range from cache
		if (obj.__world === this)
		{
			var grid = obj.__grid_bounderies;
		}
		// if not in world, generate grid range
		else
		{
			var grid = this.__get_grid_range(obj);
		}
		
		// for return value
		var found = 0;
		
		// so we won't test same objects multiple times
		var already_tests = {};
		
		// iterate over grid this shape touches
		for (var i = grid.min_x; i <= grid.max_x; ++i)
		{
			// skip empty rows
			if (this.__bodies[i] === undefined)
			{
				continue;
			}

			// iterate on current grid row
			for (var j = grid.min_y; j <= grid.max_y; ++j)
			{
				var curr_grid_chunk = this.__bodies[i][j];
				
				// skip empty grid chunks
				if (curr_grid_chunk === undefined)
				{
					continue;
				}
				
				// iterate over objects in grid chunk and check collision
				for (var x = 0; x < curr_grid_chunk.length; ++x)
				{
					// get current object
					var curr_obj = curr_grid_chunk[x];
					
					// make sure object is not self
					if (curr_obj === obj)
					{
						continue;
					}
					
					// check if this object was already tested
					if (already_tests[curr_obj.get_id()])
					{
						continue;
					}
					already_tests[curr_obj.get_id()] = true;
					
					// if collision tags don't match skip this object
					if (!curr_obj.collision_tags_match(collision_tags_val))
					{
						continue;
					}
					
					// if collide with object:
					if (curr_obj.test_collide_with(obj))
					{
						// if got collision list to fill, add object and set return value to true
						if (out_list)
						{
							found++;
							out_list.push(curr_obj);
							if (ret_objs_count && found >= ret_objs_count)
							{
								return true;
							}
						}
						// if don't have collision list to fill simply return true
						else
						{
							return true;
						}
					}
				}
				
			}
		}
		
		// return if collided 
		// note: get here only if got list to fill or if no collision found
		return found > 0;
	},
	
	// debug-render all the objects in world
	// canvas: a 2d canvas object to render on.
	// camera_pos: optional, vector that represent the current camera position is 2d space.
	// show_grid: default to true, if set will render background grid that shows which grid chunks are currently active
	// NOTE: this function will NOT clear canvas before rendering, if you render within a main loop its your responsibility.
	render: function (canvas, camera_pos, show_grid)
	{
		// set default camera pos if doesn't exist
		camera_pos = camera_pos || SSCD.Vector.ZERO;
		
		// get ctx and reset previous transformations
		var ctx = canvas.getContext('2d');
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		
		// get current grid size
		var grid_size = this.__params.grid_size;
		
		// get grid parts that are visible based on canvas size and camera position
		var min_i = Math.floor((camera_pos.x) / grid_size);
		var min_j = Math.floor((camera_pos.y) / grid_size);
		var max_i = min_i + Math.ceil(canvas.width / grid_size);
		var max_j = min_j + Math.ceil(canvas.height / grid_size);
		
		// a list of objects to render
		var render_list = [];
		
		// iterate over grid
		for (var i = min_i; i <= max_i; ++i)
		{
			
			// go over grid row
			for (var j = min_j; j <= max_j; ++j)
			{
				// get current grid chunk
				var curr_grid_chunk = undefined;
				if (this.__bodies[i])
				{
					var curr_grid_chunk = this.__bodies[i][j];
				}
								
				// render current grid chunk
				var position = new SSCD.Vector(i * grid_size, j * grid_size).sub_self(camera_pos);
				ctx.beginPath();
				ctx.rect(position.x, position.y, grid_size-1, grid_size-1);
				ctx.lineWidth = "1";
				if ((curr_grid_chunk === undefined) || (curr_grid_chunk.length === 0))
				{
					ctx.strokeStyle = 'rgba(100, 100, 100, 0.255)';
				}
				else
				{
					ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
				}
				ctx.stroke();
				
				
				// if current grid chunk has no objects skip
				if (curr_grid_chunk === undefined)
				{
					continue;
				}
				
				// iterate over all objects in current grid chunk and add them to render list
				for (var x = 0; x < curr_grid_chunk.length; ++x)
				{
					var curr_obj = curr_grid_chunk[x];
					if (render_list.indexOf (curr_obj) === -1)
					{
						render_list.push(curr_grid_chunk[x]);
					}
				}
			}
		}
		
		// now render all objects in render list
		for (var i = 0; i < render_list.length; ++i)
		{
			render_list[i].render(ctx, camera_pos);
		}
	},
};


// for illegal action exception
SSCD.IllegalActionError = function (message) {
    this.name = "Illegal Action";
    this.message = (message || "");
}
SSCD.IllegalActionError.prototype = Error.prototype;



// FILE: utils/math.js

/*
* Add some useful Math functions
* Author: Ronen Ness, 2015
*/

// set namespace
var SSCD = SSCD || {};
SSCD.Math = {};

// Converts from degrees to radians.
SSCD.Math.to_radians = function (degrees) {
	return degrees * Math.PI / 180;
};

// Converts from radians to degrees.
SSCD.Math.to_degrees = function (radians) {
	return radians * 180 / Math.PI;
};

// get distance between vectors
SSCD.Math.distance = function (p1, p2) {
	var dx = p2.x - p1.x,
		dy = p2.y - p1.y;
	return Math.sqrt(dx * dx + dy * dy);
};

// get distance without sqrt
SSCD.Math.dist2 = function (p1, p2) {
	var dx = p2.x - p1.x,
		dy = p2.y - p1.y;
	return (dx * dx + dy * dy);
};

// angle between two vectors
SSCD.Math.angle = function (P1, P2) {
	var deltaY = P2.y - P1.y,
		deltaX = P2.x - P1.x;

	return Math.atan2(deltaY, deltaX) * 180 / Math.PI;
};

// distance from point to line
// p is point to check
// v and w are the two edges of the line segment
SSCD.Math.distance_to_line = function (p, v, w) {

	var l2 = SSCD.Math.dist2(v, w);
	var t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
	if (t < 0) {
		return SSCD.Math.distance(p, v);
	}
	if (t > 1) {
		return SSCD.Math.distance(p, w);
	}
	return SSCD.Math.distance(p, { x: v.x + t * (w.x - v.x),
					y: v.y + t * (w.y - v.y) });
};

// Adapted from: http://stackoverflow.com/questions/563198/how-do-you-detect-where-two-line-segments-intersect/1968345#1968345
// check if two lines intersect
SSCD.Math.line_intersects = function (p0, p1, p2, p3) {

    var s1_x, s1_y, s2_x, s2_y;
    s1_x = p1.x - p0.x;
    s1_y = p1.y - p0.y;
    s2_x = p3.x - p2.x;
    s2_y = p3.y - p2.y;

    var s, t;
    s = (-s1_y * (p0.x - p2.x) + s1_x * (p0.y - p2.y)) / (-s2_x * s1_y + s1_x * s2_y);
    t = (s2_x * (p0.y - p2.y) - s2_y * (p0.x - p2.x)) / (-s2_x * s1_y + s1_x * s2_y);

    if (s >= 0 && s <= 1 && t >= 0 && t <= 1)
    {
		// Collision detected
		return 1;
	}

    return 0; // No collision
};

// return if point is on given line
SSCD.Math.is_on_line = function (v, l1, l2) {
	return SSCD.Math.distance_to_line(v, l1, l2) <= 5;
};

// FILE: utils/vector.js

/*
* Define vector class
* Author: Ronen Ness, 2015
*/

// set namespace
var SSCD = SSCD || {};

// a 2d vector
SSCD.Vector = function (x, y) {
	this.x = x;
	this.y = y;
};
 
 
// set vector functions
SSCD.Vector.prototype = {
	
	// for debug and prints
	get_name: function()
	{
		return "vector";
	},
	
	// clone vector
	clone: function ()
	{
		return new SSCD.Vector(this.x, this.y);
	},
	
	// get distance from another vector
	distance_from: function (other)
	{
		return SSCD.Math.distance(this, other);
	},
	
	// get angle from another vector
	angle_from: function (other)
	{
		return SSCD.Math.angle(this, other);
	},
	
	// add vector to self
	add_self: function (other)
	{
		this.x += other.x;
		this.y += other.y;
		return this;
	},
	
	// sub vector from self
	sub_self: function (other)
	{
		this.x -= other.x;
		this.y -= other.y;
		return this;
	},
	
	// divide vector from self
	divide_self: function (other)
	{
		this.x /= other.x;
		this.y /= other.y;
		return this;
	},
	
	// multiple this vector with another
	multiply_self: function (other)
	{
		this.x *= other.x;
		this.y *= other.y;
		return this;
	},	
	
	// add scalar to self
	add_scalar_self: function (val)
	{
		this.x += val;
		this.y += val;
		return this;
	},
	
	// substract scalar from self
	sub_scalar_self: function (val)
	{
		this.x -= val;
		this.y -= val;
		return this;
	},

	// divide scalar from self
	divide_scalar_self: function (val)
	{
		this.x /= val;
		this.y /= val;
		return this;
	},
	
	// multiply scalar from self
	multiply_scalar_self: function (val)
	{
		this.x *= val;
		this.y *= val;
		return this;
	},	
	
	// add to vector without changing self
	add: function (other)
	{
		return this.clone().add_self(other);
	},
	
	// sub from vector without changing self
	sub: function (other)
	{
		return this.clone().sub_self(other);
	},
	
	// multiply vector without changing self
	multiply: function (other)
	{
		return this.clone().multiply_self(other);
	},	
	
	// divide vector without changing self
	divide: function (other)
	{
		return this.clone().divide_self(other);
	},		
	
	// add scalar without changing self
	add_scalar: function (val)
	{
		return this.clone().add_scalar_self(val);
	},
	
	// substract scalar without changing self
	sub_scalar: function (val)
	{
		return this.clone().sub_scalar_self(val);
	},
	
	// multiply scalar without changing self
	multiply_scalar: function (val)
	{
		return this.clone().multiply_scalar_self(val);
	},	
	
	// divide scalar without changing self
	divide_scalar: function (val)
	{
		return this.clone().divide_scalar_self(val);
	},
	
	// clamp vector values
	clamp: function (min, max)
	{
		if (this.x < min) this.x = min;
		if (this.y < min) this.y = min;
		if (this.x > max) this.x = max;
		if (this.y > max) this.y = max;
		return this;
	},
	
	// get angle from vector
	from_angle: function (angle)
	{
		this.x = Math.cos(angle);
		this.y = Math.sin(angle);
		return this;
	},
	
	// apply a function on x and y components on self
	apply_self: function (func)
	{
		this.x = func(this.x);
		this.y = func(this.y);
		return this;
	},
	
	// apply a function on x and y components
	apply: function (func)
	{
		return this.clone().apply_self(func);
	},
	
	// print debug
	debug: function ()
	{
		console.debug(this.x + ", " + this.y);
	}
};

SSCD.Vector.ZERO = new SSCD.Vector(0, 0);
SSCD.Vector.ONE = new SSCD.Vector(1, 1);
SSCD.Vector.UP = new SSCD.Vector(0, -1);
SSCD.Vector.DOWN = new SSCD.Vector(0, 1);
SSCD.Vector.LEFT = new SSCD.Vector(-1, 0);
SSCD.Vector.RIGHT = new SSCD.Vector(1, 0);
SSCD.Vector.UP_LEFT = new SSCD.Vector(-1, -1);
SSCD.Vector.DOWN_LEFT = new SSCD.Vector(-1, 1);
SSCD.Vector.UP_RIGHT = new SSCD.Vector(1, -1);
SSCD.Vector.DOWN_RIGHT = new SSCD.Vector(1, 1)

// FILE: utils/extend.js

/*
* Provide simple inheritance (extend prototype)
* Author: Ronen Ness, 2015
*/

// set namespace
var SSCD = SSCD || {};

// inherit base into child
// base / child must be object's prototype (eg SSCD.something.prototype)
// NOTE: don't use javascript built-ins so you won't mess up their prototypes.
SSCD.extend = function (base, child)
{	

	// copy all properties
	for (var prop in base)
	{
		if (child[prop])
			continue;
		
		child[prop] = base[prop];
	}

	// create inits list (constructors)
	// this creates a function namd .init() that will call all the __init__() functions in the inheritance chain by the order it was extended.
	child.__inits = child.__inits || [];
	
	// add parent init function
	if (base.__init__)
	{
		child.__inits.push(base.__init__);
	}

	// set init function
	child.init = function ()
	{
		for (var i = 0; i < this.__inits.length; ++i)
		{
			this.__curr_init_func = this.__inits[i];
			this.__curr_init_func();
		}
		delete this.__curr_init_func;
	}
}

// for not-implemented exceptions
SSCD.NotImplementedError = function (message) {
    this.name = "NotImplementedError";
    this.message = (message || "");
}
SSCD.NotImplementedError.prototype = Error.prototype;

// FILE: utils/aabb.js

/*
* Define axis-aligned-bounding-box class.
* Author: Ronen Ness, 2015
*/

// set namespace
var SSCD = SSCD || {};

// Axis-aligned-bounding-box class
// position: top-left corner (vector)
// size: width and height (vector)
SSCD.AABB = function (position, size) {
	this.position = position.clone();
	this.size = size.clone();
};

// some aabb methods
SSCD.AABB.prototype = {
	
	// expand this bounding-box by other bounding box
	expand: function (other)
	{
		// get new bounds
		var min_x = Math.min(this.position.x, other.position.x);
		var min_y = Math.min(this.position.y, other.position.y);
		var max_x = Math.max(this.position.x + this.size.x, other.position.x + other.size.x);
		var max_y = Math.max(this.position.y + this.size.y, other.position.y + other.size.y);
		
		// set them
		this.position.x = min_x;
		this.position.y = min_y;
		this.size.x = max_x - min_x;
		this.size.y = max_y - min_y;
	},
	
	// expand this bounding-box with vector
	add_vector: function(vector)
	{
		// update position x
		var push_pos_x = this.position.x - vector.x;
		if (push_pos_x > 0)
		{
			this.position.x -= push_pos_x;
			this.size.x += push_pos_x;
		}
		
		// update position y
		var push_pos_y = this.position.y - vector.y;
		if (push_pos_y > 0)
		{
			this.position.y -= push_pos_y;
			this.size.y += push_pos_y;
		}
		
		// update size x
		var push_size_x = vector.x - (this.position.x + this.size.x);
		if (push_size_x > 0)
		{
			this.size.x += push_size_x;
		}
		
		// update size y
		var push_size_y = vector.y - (this.position.y + this.size.y);
		if (push_size_y > 0)
		{
			this.size.y += push_size_y;
		}
	}
	
};

// FILE: shapes/shape.js

/*
* define the API of a collision shape.
* every type of shape should inherit from this class.
* Author: Ronen Ness, 2015
*/


// set namespace
var SSCD = SSCD || {};

SSCD.Shape = function ()
{
};

// shape api
SSCD.Shape.prototype = {
	
	// shape type (need to be overrided by children)
	__type: "shape",
	
	// to detect if this object is a collision shape
	is_shape: true,
	
	// optional data or object you can attach to shapes
	__data: null,
	
	// to give unique id to every shape for internal usage
	__next_id: 0,
	
	// default type flags: everything
	__collision_tags: [],
	__collision_tags_val: SSCD.World.prototype._ALL_TAGS_VAL,
	
	// init the general shape
	__init__: function ()
	{
		// create position and set default type
		this.__position = new SSCD.Vector();
		
		// for collision-world internal usage
		this.__grid_chunks = [];				// list with world chunks this shape is in
		this.__world = null;					// the parent collision world
		this.__grid_bounderies = null;			// grid bounderies
		
		// set unique ids
		this.__id = SSCD.Shape.prototype.__next_id++;
	},
	
	// get shape unique id
	get_id: function ()
	{
		return this.__id;
	},
	
	// set the collision tags of this shape.
	// for example, if you want this shape to be tagged as "wall", use:
	//		shape.set_collision_tags("walls");
	//
	// you can also set multiple tags, like this:
	//		shape.set_collision_tags(["walls", "glass"]);
	//		
	set_collision_tags: function (tags)
	{
		// can't set tags without world instance
		if (this.__world === null)
		{
			throw new SSCD.IllegalActionError("Can't set tags for a shape that is not inside a collision world!");
		}
		
		// set the collision tag hash value
		this.__collision_tags_val = this.__world.__get_tags_value(tags);
		
		// convert tags to array and store them
		if (!tags instanceof Array)
		{
			tags = [tags];
		}
		this.__collision_tags = tags;
		
		// if there's a hook to call when setting tags, call it
		if (this.__update_tags_hook)
		{
			this.__update_tags_hook();
		}
		
		// return self
		return this;
	},
	
	// optional hook to call after updating collision tags
	__update_tags_hook: null,
	
	// return collision tag(s) (always return a list of strings)
	get_collision_tags: function (tags)
	{
		return this.__collision_tags;
	},
	
	// check collision tags match
	// tags can either be the tags numeric value, a single string, or a list of strings.
	// note: if provided string or list of strings this shape must be inside a collision world.
	collision_tags_match: function (tags)
	{
		// if need to convert tags to their numeric value
		if (isNaN(tags))
		{
			// if don't have collision world raise error
			if (this.__world === null)
			{
				throw new SSCD.IllegalActionError("If you provide tags as string(s) the shape must be inside a collision world to convert them!");
			}
			tags = this.__world.__get_tags_value(tags);
		}
		
		// check if tags match
		return (this.__collision_tags_val & tags) !== 0;
	},
	
	// check collision with other object (vector, other shape, etc..)
	test_collide_with: function (obj)
	{
		return SSCD.CollisionManager.test_collision(this, obj);
	},
	
	// return shape fill color for debug rendering
	__get_render_fill_color: function (opacity)
	{
		// if have override fill color use it:
		if (this.__override_fill_color)
		{
			return this.__override_fill_color;
		}
		
		// else, return color based on tag
		return this.__collision_tags_to_color(this.__collision_tags_val, opacity);
	},
	
	// return shape stroke color for debug rendering
	__get_render_stroke_color: function (opacity)
	{
		// if have override stroke color use it:
		if (this.__override_stroke_color)
		{
			return this.__override_stroke_color;
		}
		
		// else, return color based on tag
		return this.__collision_tags_to_color(this.__collision_tags_val, opacity);
	},
	
	// set colors to override the debug rendering colors
	// accept any html5 color value (eg "rgba(r,g,b,a)" or "white")
	// set nulls to use default colors (based on shape tags)
	set_debug_render_colors: function(fill_color, stroke_color)
	{
		this.__override_fill_color = fill_color;
		this.__override_stroke_color = stroke_color;
	},
	
	// default override colors is null - don't override debug colors
	__override_fill_color: null,
	__override_stroke_color: null,
	
	// return color based on collision tags
	__collision_tags_to_color: function (tags, opacity)
	{
		var r = Math.round(Math.abs(Math.sin(tags)) * 255);
		var g = Math.round(Math.abs(Math.cos(tags)) * 255);
		var b = Math.round(r ^ g);
		return "rgba(" + r + "," + g + "," + b + "," + opacity + ")";
	},
	
	// attach data/object to this shape
	set_data: function (obj)
	{
		this.__data = obj;
		return this;
	},
	
	// get attached data / object of this shape
	get_data: function ()
	{
		return this.__data;
	},

	// return shape type
	get_name: function ()
	{
		return this.__type;
	},
	
	// set position
	set_position: function (vector)
	{
		this.__position.x = vector.x;
		this.__position.y = vector.y;
		this.__update_position();
		return this;
	},
	
	// get position (return vector)
	get_position: function ()
	{
		return this.__position.clone();
	},
	
	// move the shape
	move: function (vector)
	{
		this.set_position(this.get_position().add_self(vector));
		return this;
	},
	
	// should be called whenever position changes
	__update_position: function ()
	{
		// call position-change hook
		if (this.__update_position_hook)
		{
			this.__update_position_hook();
		}
		
		// remove bounding box cache
		this.reset_aabb();
		
		// update in world
		this.__update_parent_world();
	},
	
	// reset bounding box
	reset_aabb: function()
	{
		this.__aabb = undefined;
	},
	
	// update this shape in parent world (call this when shape change position or change and need to notify world)
	__update_parent_world: function ()
	{
		if (this.__world)
		{
			this.__world.__update_shape_grid(this);
		}
	},
	
	// optional hook you can override that will be called whenever shape position changes.
	__update_position_hook: null,
	
	// render (for debug purposes)
	// camera_pos is optional 2d camera position
	render: function (ctx, camera_pos)
	{
		throw new SSCD.NotImplementedError();
	},
	
	// build the shape's axis-aligned bounding box
	build_aabb: function ()
	{
		throw new SSCD.NotImplementedError();
	},
	
	// return axis-aligned-bounding-box
	get_aabb: function ()
	{
		this.__aabb = this.__aabb || this.build_aabb();
		return this.__aabb;
	},
	
};

// FILE: shapes/circle.js

/*
* A circle collision shape
* Author: Ronen Ness, 2015
*/


// set namespace
var SSCD = SSCD || {};

// define the circle shape
// position - starting position (vector)
// radius - circle radius (integer)
SSCD.Circle = function (position, radius)
{
	// call init chain
	this.init();
	
	// set radius and size
	this.__radius = radius;
	this.__size = new SSCD.Vector(radius, radius).multiply_scalar_self(2);

	// set starting position
	this.set_position(position);
};

// set circle methods
SSCD.Circle.prototype = {
	
	__type: "circle",
	
	// render (for debug purposes)
	render: function (ctx, camera_pos)
	{
		// apply camera on position
		var position = this.get_position().sub(camera_pos);
					
		// draw the circle
		ctx.beginPath();
		ctx.arc(position.x, position.y, this.__radius, 0, 2 * Math.PI, false);
		
		// draw stroke
		ctx.lineWidth = "7";
		ctx.strokeStyle = this.__get_render_stroke_color(0.75);
		ctx.stroke();
		
		// draw fill
		ctx.fillStyle = this.__get_render_fill_color(0.35);
		ctx.fill();
	},
	
	// return circle radius
	get_radius: function ()
	{
		return this.__radius;
	},
	
	// return axis-aligned-bounding-box
	build_aabb: function ()
	{
		return new SSCD.AABB(this.get_position().sub_scalar(this.__radius), this.__size);
	},
	
};

// inherit from basic shape class.
// this will fill the missing functions from parent, but will not replace functions existing in child.
SSCD.extend(SSCD.Shape.prototype, SSCD.Circle.prototype);

// FILE: shapes/rectangle.js

/*
* rectangle collision shape
* Author: Ronen Ness, 2015
*/


// set namespace
var SSCD = SSCD || {};

// define the rectangle shape
// position - starting position (vector)
// size - rectangle size (vector)
SSCD.Rectangle = function (position, size)
{
	// call init chain
	this.init();
	
	// set radius and size
	this.__size = size;

	// set starting position
	this.set_position(position);
};

// set Rectangle methods
SSCD.Rectangle.prototype = {
	
	__type: "rectangle",
	
	// render (for debug purposes)
	render: function (ctx, camera_pos)
	{
		// apply camera on position
		var position = this.get_position().sub(camera_pos);
					
		// draw the rect
		ctx.beginPath();
		ctx.rect(position.x, position.y, this.__size.x, this.__size.y);
		
		// draw stroke
		ctx.lineWidth = "7";
		ctx.strokeStyle = this.__get_render_stroke_color(0.75);
		ctx.stroke();
		
		// draw fill
		ctx.fillStyle = this.__get_render_fill_color(0.35);
		ctx.fill();
	},
	
	// return rectangle size
	get_size: function ()
	{
		return this.__size.clone();
	},
	
	// return axis-aligned-bounding-box
	build_aabb: function ()
	{
		return new SSCD.AABB(this.__position, this.__size);
	},
	
	// return absolute top-left corner
	get_top_left: function()
	{
		this.__top_left_c = this.__top_left_c || this.__position.clone();
		return this.__top_left_c;
	},
	
	// return absolute bottom-left corner
	get_bottom_left: function()
	{
		this.__bottom_left_c = this.__bottom_left_c || this.__position.add(new SSCD.Vector(0, this.__size.y));
		return this.__bottom_left_c;
	},
	
	// return absolute top-right corner
	get_top_right: function()
	{
		this.__top_right_c = this.__top_right_c || this.__position.add(new SSCD.Vector(this.__size.x, 0));
		return this.__top_right_c;
	},
	
	// return absolute bottom-right corner
	get_bottom_right: function()
	{
		this.__bottom_right_c = this.__bottom_right_c || this.__position.add(new SSCD.Vector(this.__size.x, this.__size.y));
		return this.__bottom_right_c;
	},
	
	// return absolute center
	get_abs_center: function()
	{
		this.__abs_center_c = this.__abs_center_c || this.__position.add(this.__size.divide_scalar(2));
		return this.__abs_center_c;
	},
	
	// on position change
	__update_position_hook: function()
	{
		// clear corner cache
		this.__top_left_c = undefined;
		this.__top_right_c = undefined;
		this.__bottom_left_c = undefined;
		this.__bottom_right_c = undefined;
		this.__abs_center_c = undefined;
	},
	
};

// inherit from basic shape class.
// this will fill the missing functions from parent, but will not replace functions existing in child.
SSCD.extend(SSCD.Shape.prototype, SSCD.Rectangle.prototype);

// FILE: shapes/line.js

/*
* A line collision shape
* Author: Ronen Ness, 2015
*/


// set namespace
var SSCD = SSCD || {};

// define the line shape
// source - starting position (vector)
// dest - destination point (vector)
// output line will be from source to dest, and when you move it you will actually move the source position.
SSCD.Line = function (source, dest)
{
	// call init chain
	this.init();
	
	// set dest position
	this.__dest = dest;

	// set starting position
	this.set_position(source);
};

// set line methods
SSCD.Line.prototype = {
	
	__type: "line",
	
	// render (for debug purposes)
	render: function (ctx, camera_pos)
	{
		// apply camera on position
		var position = this.get_position().sub(camera_pos);
					
		// draw the line
		ctx.beginPath();
		ctx.moveTo(this.__position.x, this.__position.y);
		var dest = this.__position.add(this.__dest);
		ctx.lineTo(dest.x, dest.y);
		
		// draw stroke
		ctx.lineWidth = "7";
		ctx.strokeStyle = this.__get_render_stroke_color(0.75);
		ctx.stroke();
		
	},
	
	// return axis-aligned-bounding-box
	build_aabb: function ()
	{
		var pos = new SSCD.Vector(0, 0);
		pos.x = this.__dest.x > 0 ? this.__position.x : this.__position.x - this.__dest.x;
		pos.y = this.__dest.y > 0 ? this.__position.y : this.__position.y - this.__dest.y;
		var size = this.__dest.apply(Math.abs);
		return new SSCD.AABB(pos, size);
	},
	
	// return absolute first point
	get_p1: function()
	{
		this.__p1_c = this.__p1_c || this.__position.clone();
		return this.__p1_c;
	},
	
	// return absolute second point
	get_p2: function()
	{
		this.__p2_c = this.__p2_c || this.__position.add(this.__dest);
		return this.__p2_c;
	},
	
	// on position change
	__update_position_hook: function()
	{
		// clear points cache
		this.__p1_c = undefined;
		this.__p2_c = undefined;
	},
	
};

// inherit from basic shape class.
// this will fill the missing functions from parent, but will not replace functions existing in child.
SSCD.extend(SSCD.Shape.prototype, SSCD.Line.prototype);

// FILE: shapes/lines_strip.js

/*
* A strip-of-lines collision shape
* Author: Ronen Ness, 2015
*/


// set namespace
var SSCD = SSCD || {};

// define the line shape
// position - starting position (vector)
// points - list of vectors that will make the lines.
// closed - default to false. if true, will close the shape.
SSCD.LineStrip = function (position, points, closed)
{
	// call init chain
	this.init();
	
	// set points
	this.__points = points;
	
	// if not enough points assert
	if (points.length <= 1)
	{
		throw new SSCD.IllegalActionError("Not enough vectors for LineStrip (got to have at least two vectors)");
	}
	
	// close shape
	if (closed)
	{
		this.__points.push(this.__points[0]);
	}

	// set starting position
	this.set_position(position);
};

// set line methods
SSCD.LineStrip.prototype = {
	
	__type: "line-strip",
	
	// render (for debug purposes)
	render: function (ctx, camera_pos)
	{
		// apply camera on position
		var position = this.get_position().sub(camera_pos);
					
		// draw the lines
		ctx.beginPath();
		for (var i = 0; i < this.__points.length-1; ++i)
		{
			var from = this.__position.add(this.__points[i]);
			var to = this.__position.add(this.__points[i+1]);
			ctx.moveTo(from.x, from.y);
			ctx.lineTo(to.x, to.y);
		}
		
		// add last point
		ctx.moveTo(to.x, to.y);
		var to = this.__position.add(this.__points[this.__points.length-1]);
		ctx.lineTo(to.x, to.y);
		
		// draw stroke
		ctx.lineWidth = "7";
		ctx.strokeStyle = this.__get_render_stroke_color(0.75);
		ctx.stroke();
		
		// now render bounding-box
		var box = this.get_aabb();
				
		// draw the rect
		ctx.beginPath();
		ctx.rect(box.position.x - camera_pos.x, box.position.y - camera_pos.y, box.size.x, box.size.y);
		
		// draw stroke
		ctx.lineWidth = "1";
		ctx.strokeStyle = 'rgba(50, 175, 45, 0.5)';
		ctx.stroke();
		
	},
	
	// return line list with absolute positions
	get_abs_lines: function()
	{
		// if got lines in cache return it
		if (this.__abs_lines_c)
		{
			return this.__abs_lines_c;
		}
		
		// create list of lines
		var points = this.get_abs_points();
		var ret = [];
		for (var i = 0; i < points.length-1; i++)
		{
			ret.push([points[i], points[i+1]]);
		}
		
		// add to cache and return
		this.__abs_lines_c = ret;
		return ret;
	},
	
	// return points with absolute position
	get_abs_points: function()
	{
		// if got points in cache return it
		if (this.__abs_points_c)
		{
			return this.__abs_points_c;
		}

		// convert points
		var ret = [];
		for (var i = 0; i < this.__points.length; i++)
		{
			ret.push(this.__points[i].add(this.__position));
		}
		
		// add to cache and return
		this.__abs_points_c = ret;
		return ret;
	},
	
	// on position change
	__update_position_hook: function()
	{
		// clear points and lines cache
		this.__abs_points_c = undefined;
		this.__abs_lines_c = undefined;
	},
	
	// return axis-aligned-bounding-box
	build_aabb: function ()
	{
		var ret = new SSCD.AABB( SSCD.Vector.ZERO, SSCD.Vector.ZERO);
		for (var i = 0; i < this.__points.length; ++i)
		{
			ret.add_vector(this.__points[i]);
		}
		ret.position.add_self(this.__position);
		return ret;
	},
	
};

// inherit from basic shape class.
// this will fill the missing functions from parent, but will not replace functions existing in child.
SSCD.extend(SSCD.Shape.prototype, SSCD.LineStrip.prototype);

// FILE: shapes/composite_shape.js

/*
* a special shape made from multiple shapes combined together
* Author: Ronen Ness, 2015
*/


// set namespace
var SSCD = SSCD || {};

// create a composite shape
// position - optional starting position (vector)
// objects - optional list of collision objects to start with
SSCD.CompositeShape = function (position, objects)
{
	// call init chain
	this.init();
	
	// create empty list of shapes
	this.__shapes = [];
	
	// default position
	position = position || SSCD.Vector.ZERO;
	this.set_position(position);

	// add objects if provided
	if (objects)
	{
		for (var i = 0; i < objects.length; ++i)
		{
			this.add(objects[i]);
		}
	}
};

// set Rectangle methods
SSCD.CompositeShape.prototype = {
	
	__type: "composite-shape",
	
	// render (for debug purposes)
	render: function (ctx, camera_pos)
	{
		// first render all shapes
		for (var i = 0; i < this.__shapes.length; ++i)
		{
			this.__shapes[i].shape.render(ctx, camera_pos);
		}
		
		// now render bounding-box to mark their group boundaries
		var box = this.get_aabb();
				
		// draw the rect
		ctx.beginPath();
		ctx.rect(box.position.x - camera_pos.x, box.position.y - camera_pos.y, box.size.x, box.size.y);
		
		// draw stroke
		ctx.lineWidth = "1";
		ctx.strokeStyle = 'rgba(150, 75, 45, 0.5)';
		ctx.stroke();
	},
	
	// get shapes list
	get_shapes: function()
	{
		// if already got shapes list in cache return it
		if (this.__shapes_list_c)
		{
			return this.__shapes_list_c;
		}

		// create shapes list
		var ret = [];
		for (var i = 0; i < this.__shapes.length; ++i)
		{
			ret.push(this.__shapes[i].shape);
		}
		
		// add to cache and return
		this.__shapes_list_c = ret;
		return ret;
	},
	
	// return axis-aligned-bounding-box
	build_aabb: function ()
	{
		// if no shapes return zero aabb
		if (this.__shapes.length === 0)
		{
			return new SSCD.AABB(SSCD.Vector.ZERO, SSCD.Vector.ZERO);
		}
		
		// return combined aabb
		var ret = null;
		for (var i = 0; i < this.__shapes.length; ++i)
		{
			var curr_aabb = this.__shapes[i].shape.get_aabb();
			if (ret)
			{
				ret.expand(curr_aabb);
			}
			else
			{
				ret = curr_aabb;
			}
		}
		return ret;
	},
	
	// add shape to the composite shape
	// shape is shape to add
	add: function (shape)
	{
		// make sure shape don't have a collision world
		if (shape.__world)
		{
			throw new SSCD.IllegalActionError("Can't add shape with collision world to a composite shape!");
		}
		
		// store shape offset
		var offset = shape.__position;
		
		// reset shapes list cache
		this.__shapes_list_c = undefined;
		
		// add shape to list of shapes and fix position
		this.__shapes.push({shape: shape, offset: offset.clone()});
		shape.set_position(this.__position.add(offset));

		// reset bounding-box and notify collision world about the change
		this.reset_aabb();
		this.__update_parent_world();
		
		// set shape tags to be the composite shape tags
		shape.__collision_tags_val = this.__collision_tags_val;
		shape.__collision_tags = this.__collision_tags;
		
		// return the newly added shape
		return shape;
	},
	
	// hook to call when update tags - update all child objects with new tags
	__update_tags_hook: function()
	{
		// update all shapes about the new tags
		for (var i = 0; i < this.__shapes; ++i)
		{
			var shape = this.__shapes[i].shape;
			shape.__collision_tags_val = this.__collision_tags_val;
			shape.__collision_tags = this.__collision_tags;
		}
	},
	
	// remove a shape
	remove: function (shape)
	{
		this.__shapes_list_c = undefined;
		for (var i = 0; i < this.__shapes.length; ++i)
		{
			if (this.__shapes[i].shape === shape)
			{
				this.__shapes.splice(i, 1);
				this.__update_parent_world();
				return;
			}
		}
		
		throw new SSCD.IllegalActionError("Shape to remove is not in composite shape!");
	},
	
	// on position change - update all shapes
	__update_position_hook: function ()
	{
		for (var i = 0; i < this.__shapes.length; ++i)
		{
			this.__shapes[i].shape.set_position(this.__position.add(this.__shapes[i].offset));
		}
	}
};

// inherit from basic shape class.
// this will fill the missing functions from parent, but will not replace functions existing in child.
SSCD.extend(SSCD.Shape.prototype, SSCD.CompositeShape.prototype);

// FILE: shapes/shapes_collider.js

/*
* here we define all the collision-detection functions for all possible shape combinations
* Author: Ronen Ness, 2015
*/


// set namespace
var SSCD = SSCD || {};

SSCD.CollisionManager = {
	
	// test collision between two objects, a and b, where they can be vectors or any valid collision shape.
	test_collision: function (a, b)
	{
		// vector-vector collision
		if (a instanceof SSCD.Vector && b instanceof SSCD.Vector)
		{
			return this._test_collision_vector_vector(a, b);
		}
				
		// composite shape collision
		if (a instanceof SSCD.CompositeShape)
		{
			return this._test_collision_composite_shape(a, b);
		}
		if (b instanceof SSCD.CompositeShape)
		{
			return this._test_collision_composite_shape(b, a);
		}
		
		// circle-vector collision
		if (a instanceof SSCD.Vector && b instanceof SSCD.Circle)
		{
			return this._test_collision_circle_vector(b, a);
		}
		if (a instanceof SSCD.Circle && b instanceof SSCD.Vector)
		{
			return this._test_collision_circle_vector(a, b);
		}
		
		// circle-circle collision
		if (a instanceof SSCD.Circle && b instanceof SSCD.Circle)
		{
			return this._test_collision_circle_circle(b, a);
		}
		
		// circle-rectangle collision
		if (a instanceof SSCD.Circle && b instanceof SSCD.Rectangle)
		{
			return this._test_collision_circle_rect(a, b);
		}
		if (a instanceof SSCD.Rectangle && b instanceof SSCD.Circle)
		{
			return this._test_collision_circle_rect(b, a);
		}
		
		// circle-line collision
		if (a instanceof SSCD.Circle && b instanceof SSCD.Line)
		{
			return this._test_collision_circle_line(a, b);
		}
		if (a instanceof SSCD.Line && b instanceof SSCD.Circle)
		{
			return this._test_collision_circle_line(b, a);
		}
		
		// linestrip-line collision
		if (a instanceof SSCD.LineStrip && b instanceof SSCD.Line)
		{
			return this._test_collision_linestrip_line(a, b);
		}
		if (a instanceof SSCD.Line && b instanceof SSCD.LineStrip)
		{
			return this._test_collision_linestrip_line(b, a);
		}
		
		// circle-linestrip collision
		if (a instanceof SSCD.Circle && b instanceof SSCD.LineStrip)
		{
			return this._test_collision_circle_linestrip(a, b);
		}
		if (a instanceof SSCD.LineStrip && b instanceof SSCD.Circle)
		{
			return this._test_collision_circle_linestrip(b, a);
		}		
	
		// rect-vector collision
		if (a instanceof SSCD.Vector && b instanceof SSCD.Rectangle)
		{
			return this._test_collision_rect_vector(b, a);
		}
		if (a instanceof SSCD.Rectangle && b instanceof SSCD.Vector)
		{
			return this._test_collision_rect_vector(a, b);
		}
		
		// rect-rect collision
		if (a instanceof SSCD.Rectangle && b instanceof SSCD.Rectangle)
		{
			return this._test_collision_rect_rect(b, a);
		}
		
		// line-strip with line-strip collision
		if (a instanceof SSCD.LineStrip && b instanceof SSCD.LineStrip)
		{
			return this._test_collision_linestrip_linestrip(a, b)
		}

		// rect-line collision
		if (a instanceof SSCD.Line && b instanceof SSCD.Rectangle)
		{
			return this._test_collision_rect_line(b, a);
		}
		if (a instanceof SSCD.Rectangle && b instanceof SSCD.Line)
		{
			return this._test_collision_rect_line(a, b);
		}	
		
		// rect-linestrip collision
		if (a instanceof SSCD.LineStrip && b instanceof SSCD.Rectangle)
		{
			return this._test_collision_rect_linestrip(b, a);
		}
		if (a instanceof SSCD.Rectangle && b instanceof SSCD.LineStrip)
		{
			return this._test_collision_rect_linestrip(a, b);
		}	
		
		// line-line collision
		if (a instanceof SSCD.Line && b instanceof SSCD.Line)
		{
			return this._test_collision_line_line(a, b);
		}
		
		// vector-line collision
		if (a instanceof SSCD.Line && b instanceof SSCD.Vector)
		{
			return this._test_collision_vector_line(b, a);
		}
		if (a instanceof SSCD.Vector && b instanceof SSCD.Line)
		{
			return this._test_collision_vector_line(a, b);
		}	
		
		// vector-linestrip collision
		if (a instanceof SSCD.LineStrip && b instanceof SSCD.Vector)
		{
			return this._test_collision_vector_linestrip(b, a);
		}
		if (a instanceof SSCD.Vector && b instanceof SSCD.LineStrip)
		{
			return this._test_collision_vector_linestrip(a, b);
		}	
	
		// unsupported shapes!
		throw new SSCD.UnsupportedShapes(a, b);
	},
	
	// test collision between two vectors
	_test_collision_vector_vector: function(a, b)
	{
		return (a.x === b.x) && (a.y === b.y);
	},
	
	// test collision between circle and vector
	_test_collision_circle_vector: function (circle, vector)
	{
		return SSCD.Math.distance(circle.__position, vector) <= circle.__radius;
	},
	
	// test collision between circle and another circle
	_test_collision_circle_circle: function (a, b)
	{
		return SSCD.Math.distance(a.__position, b.__position) <= a.__radius + b.__radius;
	},
	
	// test collision between rectangle and vector
	_test_collision_rect_vector: function (rect, vector)
	{
		return 	(vector.x >= rect.__position.x) && (vector.y >= rect.__position.y) &&
					(vector.x <= rect.__position.x + rect.__size.x) &&
					(vector.y <= rect.__position.y + rect.__size.y);
	},
	
	// test collision vector with line
	_test_collision_vector_line: function (v, line)
	{
		return SSCD.Math.is_on_line(v, line.get_p1(), line.get_p2());
	},
	
	// test collision vector with linestrip
	_test_collision_vector_linestrip: function(v, linestrip)
	{
		var lines = linestrip.get_abs_lines();
		for (var i = 0; i < lines.length; ++i)
		{
			if (SSCD.Math.is_on_line(v, lines[i][0], lines[i][1]))
			{
				return true;
			}
		}
		return false;
	},
	
	// test collision between circle and line
	_test_collision_circle_line: function (circle, line)
	{
		return SSCD.Math.distance_to_line(circle.__position, line.get_p1(), line.get_p2()) <= circle.__radius;
	},
	
	// test collision between circle and line-strip
	_test_collision_circle_linestrip: function (circle, linestrip)
	{
		var lines = linestrip.get_abs_lines();
		for (var i = 0; i < lines.length; ++i)
		{
			if (SSCD.Math.distance_to_line(circle.__position, lines[i][0], lines[i][1]) <= circle.__radius)
			{
				return true;
			}
		}
		return false;
	},
	
	// test collision between linestrip and a single line
	_test_collision_linestrip_line: function(linestrip, line)
	{
		var lines = linestrip.get_abs_lines();
		var p1 = line.get_p1(), p2 = line.get_p2();
		for (var i = 0; i < lines.length; ++i)
		{
			if (SSCD.Math.line_intersects(p1, p2, lines[i][0], lines[i][1]))
			{
				return true;
			}
		}
		return false;
	},
	
	// check collision line with line
	_test_collision_line_line: function (a, b)
	{
		return SSCD.Math.line_intersects(a.get_p1(),  a.get_p2(), 
														b.get_p1(),  b.get_p2());
	},
	
	// check collision between rectangle and line
	_test_collision_rect_line: function (rect, line)
	{
		// get the line's two points
		var p1 = line.get_p1();
		var p2 = line.get_p2();
		
		// first check if one of the line points is contained inside the rectangle
		if (SSCD.CollisionManager._test_collision_rect_vector(rect, p1) || 
			SSCD.CollisionManager._test_collision_rect_vector(rect, p2))
			{
				return true;
			}
		
		// now check collision between line and rect lines
		
		// left side
		var r1 = rect.get_top_left();
		var r2 = rect.get_bottom_left();
		if (SSCD.Math.line_intersects(p1, p2, r1, r2))
		{
			return true;
		}
		
		// right side
		var r3 = rect.get_top_right();
		var r4 = rect.get_bottom_right();
		if (SSCD.Math.line_intersects(p1, p2, r3, r4))
		{
			return true;
		}

		// top side
		if (SSCD.Math.line_intersects(p1, p2, r1, r3))
		{
			return true;
		}
		
		// bottom side
		if (SSCD.Math.line_intersects(p1, p2, r2, r4))
		{
			return true;
		}
		
		// no collision
		return false;
	},
	
	// test collision between rectagnle and linesstrip
	_test_collision_rect_linestrip: function(rect, linesstrip)
	{
		// first check all points
		var points = linesstrip.get_abs_points();
		for (var i = 0; i < points.length; ++i)
		{
			if (this._test_collision_rect_vector(rect, points[i]))
			{
				return true;
			}
		}
		
		// now check intersection with rectangle sides
		
		var r1 = rect.get_top_left();
		var r2 = rect.get_bottom_left();
		var r3 = rect.get_top_right();
		var r4 = rect.get_bottom_right();
		
		var lines = linesstrip.get_abs_lines();
		for (var i = 0; i < lines.length; ++i)
		{
			var p1 = lines[i][0];
			var p2 = lines[i][1];
			
			// left side
			if (SSCD.Math.line_intersects(p1, p2, r1, r2))
			{
				return true;
			}
			
			// right side
			if (SSCD.Math.line_intersects(p1, p2, r3, r4))
			{
				return true;
			}

			// top side
			if (SSCD.Math.line_intersects(p1, p2, r1, r3))
			{
				return true;
			}
			
			// bottom side
			if (SSCD.Math.line_intersects(p1, p2, r2, r4))
			{
				return true;
			}
		}
			
		// no collision
		return false;
	},
	
	// test collision between two linestrips
	_test_collision_linestrip_linestrip: function (strip1, strip2)
	{
		var lines1 = strip1.get_abs_lines();
		var lines2 = strip2.get_abs_lines();
		for (var i = 0; i < lines1.length; ++i)
		{
				for (var j = 0; j < lines2.length; ++j)
				{
					if (SSCD.Math.line_intersects(	lines1[i][0], lines1[i][1],
																lines2[j][0], lines2[j][1]))
																{
																	return true;
																}
				}
		}
		return false;
	},
	
	// test composite shape with any other shape
	_test_collision_composite_shape: function(composite, other)
	{
		// get all shapes in composite shape
		var comp_shapes = composite.get_shapes();
		
		// special case: other shape is a composite shape as well
		if (other instanceof SSCD.CompositeShape)
		{
			var other_shapes = other.get_shapes();
			for (var i = 0; i < comp_shapes.length; ++i)
			{
				for (var j = 0; j < other_shapes.length; ++j)
				{
					if (SSCD.CollisionManager.test_collision(comp_shapes[i], other_shapes[j]))
					{
						return true;
					}
				}
			}
		}
		// normal case - other shape is a normal shape
		else
		{
			for (var i = 0; i < comp_shapes.length; ++i)
			{
				if (SSCD.CollisionManager.test_collision(comp_shapes[i], other))
				{
					return true;
				}
			}
		}
		
		// no collision found
		return false;
		
	},
	
	// test collision between circle and rectangle
	_test_collision_circle_rect: function (circle, rect)
	{
		// get circle center
		var circle_pos = circle.__position;
		
		// first check if circle center is inside the rectangle - easy case
		var collide = SSCD.CollisionManager._test_collision_rect_vector(rect, circle_pos);
		if (collide)
		{
			return true;
		}
		
		// get rectangle center
		var rect_center = rect.get_abs_center();
		
		// now check other simple case - collision between rect center and circle
		var collide = SSCD.CollisionManager._test_collision_circle_vector(circle, rect_center);
		if (collide)
		{
			return true;
		}
		
		var r1 = rect.get_top_left();
		var r2 = rect.get_bottom_left();
		var r3 = rect.get_top_right();
		var r4 = rect.get_bottom_right();
		
		// create a list of lines to check (in the rectangle) based on circle position to rect center
		var lines = [];
		if (rect_center.x > circle_pos.x)
		{
			lines.push([rect.get_top_left(), rect.get_bottom_left()]);
		}
		else
		{
			lines.push([rect.get_top_right(), rect.get_bottom_right()]);
		}
		if (rect_center.y > circle_pos.y)
		{
			lines.push([rect.get_top_left(), rect.get_top_right()]);
		}
		else
		{
			lines.push([rect.get_bottom_left(), rect.get_bottom_right()]);
		}
		
		// now check intersection between circle and each of the rectangle lines
		for (var i = 0; i < lines.length; ++i)
		{
			var dist_to_line = SSCD.Math.distance_to_line(circle_pos, lines[i][0], lines[i][1]);
			if (dist_to_line <= circle.__radius)
			{
				return true;
			}
		}
		
		// no collision..
		return false;		
	},
	
	// test collision between circle and rectangle
	_test_collision_rect_rect: function (a, b)
	{
		var r1 = {	left: a.__position.x, right: a.__position.x + a.__size.x, 
						top: a.__position.y, bottom: a.__position.y + a.__size.y};
		var r2 = {	left: b.__position.x, right: b.__position.x + b.__size.x, 
						top: b.__position.y, bottom: b.__position.y + b.__size.y};
		return !(r2.left > r1.right || 
           r2.right < r1.left || 
           r2.top > r1.bottom ||
           r2.bottom < r1.top);
	},
};

// exception when trying to check collision on shapes not supported
SSCD.UnsupportedShapes = function (a, b) {
    this.name = "Unsupported Shapes";
    this.message = "Unsupported shapes collision test! '" + a.get_name() + "' <-> '" + b.get_name() + "'.";
}
SSCD.UnsupportedShapes.prototype = Error.prototype;



